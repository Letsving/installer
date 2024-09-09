import ExclamationTriangleSvg from '@fortawesome/fontawesome-free/svgs/solid/triangle-exclamation.svg';
import { ipcRenderer } from 'electron';
import { isNil } from 'lodash';
import * as path from 'path';
import prettyBytes from 'pretty-bytes';
import * as React from 'react';
import { requestMetadata } from '../../app';

import { Flex, Modal as SmallModal, Txt, Spinner } from 'rendition';
import styled from 'styled-components';

import * as errors from '../../../../shared/errors';
import * as messages from '../../../../shared/messages';
import * as supportedFormats from '../../../../shared/supported-formats';
import * as selectionState from '../../models/selection-state';
import { observe } from '../../models/store';
import * as analytics from '../../modules/analytics';
import * as osDialog from '../../os/dialog';

import { DetailsText, StepNameButton } from '../../styled-components';
import { middleEllipsis } from '../../utils/middle-ellipsis';
import { SVGIcon } from '../svg-icon/svg-icon';

import ImageSvg from '../../../assets/image.svg';
import type { DrivelistDrive } from '../../../../shared/drive-constraints';
import { isJson } from '../../../../shared/utils';
import type {
	SourceMetadata,
	Authentication,
	Source,
} from '../../../../shared/typings/source-selector';
import * as i18next from 'i18next';

const isURL = (imagePath: string) =>
	imagePath.startsWith('https://') || imagePath.startsWith('http://');

// TODO move these styles to rendition
const ModalText = styled.p`
	a {
		color: rgb(0, 174, 239);

		&:hover {
			color: rgb(0, 139, 191);
		}
	}
`;

function getState() {
	const image = selectionState.getImage();
	return {
		hasImage: selectionState.hasImage(),
		imageName: image?.name,
		imageSize: image?.size,
	};
}

function isString(value: any): value is string {
	return typeof value === 'string';
}

interface SourceSelectorProps {
	flashing: boolean;
	current: string;
}

interface SourceSelectorState {
	hasImage: boolean;
	imageName?: string;
	imageSize?: number;
	warning: { message: string; title: string | null } | null;
	showImageDetails: boolean;
	showURLSelector: boolean;
	showDriveSelector: boolean;
	defaultFlowActive: boolean;
	imageSelectorOpen: boolean;
	imageLoading: boolean;
}

export class SourceSelector extends React.Component<
	SourceSelectorProps,
	SourceSelectorState
> {
	private unsubscribe: (() => void) | undefined;

	private defaultImagePath = '/home/ving/golden-image-1-x86_64-mender.img.lz4';

	constructor(props: SourceSelectorProps) {
		super(props);
		this.state = {
			...getState(),
			warning: null,
			showImageDetails: false,
			showURLSelector: false,
			showDriveSelector: false,
			defaultFlowActive: true,
			imageSelectorOpen: false,
			imageLoading: false,
		};
	}

	public componentDidMount() {
		this.unsubscribe = observe(() => {
			this.setState(getState());
		});
		ipcRenderer.send('source-selector-ready');
		this.autoSelectDefaultImage();
	}
	public componentDidUpdate(prevProps: SourceSelectorProps) {
		if (prevProps.current !== this.props.current) {
			this.autoSelectDefaultImage();
		}
	}
	public componentWillUnmount() {
		this.unsubscribe?.();
	}

	private async autoSelectDefaultImage() {
		this.setState({ imageLoading: true });
		await this.selectSource(this.defaultImagePath, 'File').promise;
		this.setState({ imageLoading: false });
	}

	public normalizeImagePath(imgPath: string) {
		const decodedPath = decodeURIComponent(imgPath);
		if (isJson(decodedPath)) {
			return JSON.parse(decodedPath).url ?? decodedPath;
		}
		return decodedPath;
	}

	private reselectSource() {
		analytics.logEvent('Reselect image', {
			previousImage: selectionState.getImage(),
		});
	}

	private selectSource(
		selected: string | DrivelistDrive,
		SourceType: Source,
		auth?: Authentication,
	): { promise: Promise<void>; cancel: () => void } {
		return {
			cancel: () => {
				// noop
			},
			promise: (async () => {
				const sourcePath = isString(selected) ? selected : selected.device;
				let metadata: SourceMetadata | undefined;
				if (isString(selected)) {
					if (
						SourceType === 'Http' &&
						!isURL(this.normalizeImagePath(selected))
					) {
						this.handleError(
							i18next.t('source.unsupportedProtocol'),
							selected,
							messages.error.unsupportedProtocol(),
						);
						return;
					}

					if (supportedFormats.looksLikeWindowsImage(selected)) {
						analytics.logEvent('Possibly Windows image', { image: selected });
						this.setState({
							warning: {
								message: messages.warning.looksLikeWindowsImage(),
								title: i18next.t('source.windowsImage'),
							},
						});
					}

					try {
						let retriesLeft = 10;
						while (requestMetadata === undefined && retriesLeft > 0) {
							await new Promise((resolve) => setTimeout(resolve, 1050)); // api is trying to connect every 1000, this is offset to make sure we fall between retries
							retriesLeft--;
						}

						metadata = await requestMetadata({ selected, SourceType, auth });

						if (!metadata?.hasMBR && this.state.warning === null) {
							analytics.logEvent('Missing partition table', { metadata });
						}
					} catch (error: any) {
						this.handleError(
							i18next.t('source.errorOpen'),
							sourcePath,
							messages.error.openSource(sourcePath, error.message),
							error,
						);
					}
				} else {
					if (selected.partitionTableType === null) {
						analytics.logEvent('Missing partition table', { selected });
					}
					metadata = {
						path: selected.device,
						displayName: selected.displayName,
						description: selected.displayName,
						size: selected.size as SourceMetadata['size'],
						SourceType: 'BlockDevice',
						drive: selected,
					};
				}

				if (metadata !== undefined) {
					metadata.auth = auth;
					metadata.SourceType = SourceType;
					selectionState.selectSource(metadata);
					analytics.logEvent('Select image', {
						image: {
							...metadata,
							logo: Boolean(metadata.logo),
							blockMap: Boolean(metadata.blockMap),
						},
					});
				}
			})(),
		};
	}

	private handleError(
		title: string,
		sourcePath: string,
		description: string,
		error?: Error,
	) {
		const imageError = errors.createUserError({
			title,
			description,
		});
		osDialog.showError(imageError);
		if (error) {
			analytics.logException(error);
			return;
		}
		analytics.logEvent(title, { path: sourcePath });
	}

	private async onDrop(event: React.DragEvent<HTMLDivElement>) {
		const file = event.dataTransfer.files.item(0);
		if (file != null) {
			await this.selectSource(file.path, 'File').promise;
		}
	}

	private onDragOver(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
	}

	private onDragEnter(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
	}

	private showSelectedImageDetails() {
		analytics.logEvent('Show selected image tooltip', {
			imagePath: selectionState.getImage()?.path,
		});

		this.setState({
			showImageDetails: true,
		});
	}

	public render() {
		const { showImageDetails, imageLoading } = this.state;
		const selectionImage = selectionState.getImage();
		let image =
			selectionImage !== undefined ? selectionImage : ({} as SourceMetadata);

		image = image.drive ?? image;

		image.name = image.description || image.name;
		const imagePath = image.path || image.displayName || '';
		const imageBasename = path.basename(imagePath);
		const imageName = image.name || '';
		const imageSize = image.size;
		const imageLogo = image.logo || '';

		return (
			<>
				<Flex
					flexDirection="column"
					alignItems="center"
					onDrop={(evt: React.DragEvent<HTMLDivElement>) => this.onDrop(evt)}
					onDragEnter={(evt: React.DragEvent<HTMLDivElement>) =>
						this.onDragEnter(evt)
					}
					onDragOver={(evt: React.DragEvent<HTMLDivElement>) =>
						this.onDragOver(evt)
					}
				>
					<SVGIcon
						contents={imageLogo}
						fallback={ImageSvg}
						style={{
							marginBottom: 30,
						}}
					/>

					{selectionImage !== undefined || imageLoading ? (
						<>
							<StepNameButton
								plain
								onClick={() => this.showSelectedImageDetails()}
								tooltip={imageName || imageBasename}
							>
								<Spinner show={imageLoading}>
									{middleEllipsis(imageName || imageBasename, 20)}
								</Spinner>
							</StepNameButton>

							{!isNil(imageSize) && !imageLoading && (
								<DetailsText>{prettyBytes(imageSize)}</DetailsText>
							)}
						</>
					) : null}
				</Flex>

				{this.state.warning != null && (
					<SmallModal
						style={{
							boxShadow: '0 3px 7px rgba(0, 0, 0, 0.3)',
						}}
						title={
							<span>
								<ExclamationTriangleSvg fill="#fca321" height="1em" />{' '}
								<span>{this.state.warning.title}</span>
							</span>
						}
						action={i18next.t('continue')}
						cancel={() => {
							this.setState({ warning: null });
							this.reselectSource();
						}}
						done={() => {
							this.setState({ warning: null });
						}}
						primaryButtonProps={{ warning: true, primary: false }}
					>
						<ModalText
							dangerouslySetInnerHTML={{ __html: this.state.warning.message }}
						/>
					</SmallModal>
				)}

				{showImageDetails && (
					<SmallModal
						title={i18next.t('source.image')}
						done={() => {
							this.setState({ showImageDetails: false });
						}}
					>
						<Txt.p>
							<Txt.span bold>{i18next.t('source.name')}</Txt.span>
							<Txt.span>{imageName || imageBasename}</Txt.span>
						</Txt.p>
						<Txt.p>
							<Txt.span bold>{i18next.t('source.path')}</Txt.span>
							<Txt.span>{imagePath}</Txt.span>
						</Txt.p>
					</SmallModal>
				)}
			</>
		);
	}
}
