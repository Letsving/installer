import * as path from 'path';
import prettyBytes from 'pretty-bytes';
import * as React from 'react';
import { Flex } from 'rendition';
import styled from 'styled-components';
import FinishPage from '../ving-installer/ving-finish';
import { ReducedFlashingInfos } from '../reduced-flashing-infos/reduced-flashing-infos';
import { SourceSelector } from './ving-source-selector';
import type { SourceMetadata } from '../../../../shared/typings/source-selector';
import * as flashState from '../../models/flash-state';
import * as selectionState from '../../models/selection-state';
import * as settings from '../../models/settings';
import { observe } from '../../models/store';
import { open as openExternal } from '../../os/open-external/services/open-external';
import { ThemedProvider } from '../../styled-components';

import {
	TargetSelector,
	getDriveListLabel,
} from '../target-selector/target-selector';
import { FlashStep } from '../../pages/main/Flash';

import EtcherSvg from '../../../assets/ving_os.svg';

function getDrivesTitle() {
	const drives = selectionState.getSelectedDrives();

	if (drives.length === 1) {
		return drives[0].description || 'Untitled Device';
	}

	if (drives.length === 0) {
		return 'No targets found';
	}

	return `${drives.length} Targets`;
}

function getImageBasename(image?: SourceMetadata) {
	if (image === undefined) {
		return '';
	}

	if (image.drive) {
		return image.drive.description;
	}
	const imageBasename = path.basename(image.path);
	return image.name || imageBasename;
}

const StepBorder = styled.div<{
	disabled: boolean;
	left?: boolean;
	right?: boolean;
}>`
	position: relative;
	height: 2px;
	background-color: ${(props) =>
		props.disabled
			? props.theme.colors.dark.disabled.foreground
			: props.theme.colors.dark.foreground};
	width: 120px;
	top: 19px;

	left: ${(props) => (props.left ? '-67px' : undefined)};
	margin-right: ${(props) => (props.left ? '-120px' : undefined)};
	right: ${(props) => (props.right ? '-67px' : undefined)};
	margin-left: ${(props) => (props.right ? '-120px' : undefined)};
`;

interface MainPageStateFromStore {
	isFlashing: boolean;
	hasImage: boolean;
	hasDrive: boolean;
	imageLogo?: string;
	imageSize?: number;
	imageName?: string;
	driveTitle: string;
	driveLabel: string;
}

interface MainPageState {
	current: 'main' | 'success';
	isWebviewShowing: boolean;
	hideSettings: boolean;
	featuredProjectURL?: string;
}

export class MainPage extends React.Component<
	object,
	MainPageState & MainPageStateFromStore
> {
	constructor(props: object) {
		super(props);
		this.state = {
			current: 'main',
			isWebviewShowing: false,
			hideSettings: true,
			...this.stateHelper(),
		};
	}

	private stateHelper(): MainPageStateFromStore {
		const image = selectionState.getImage();
		return {
			isFlashing: flashState.isFlashing(),
			hasImage: selectionState.hasImage(),
			hasDrive: selectionState.hasDrive(),
			imageLogo: image?.logo,
			imageSize: image?.size,
			imageName: getImageBasename(selectionState.getImage()),
			driveTitle: getDrivesTitle(),
			driveLabel: getDriveListLabel(),
		};
	}

	private async getFeaturedProjectURL() {
		const url = new URL(
			(await settings.get('featuredProjectEndpoint')) ||
				'https://efp.balena.io/index.html',
		);
		url.searchParams.append('borderRight', 'false');
		url.searchParams.append('darkBackground', 'true');
		return url.toString();
	}

	public async componentDidMount() {
		observe(() => {
			this.setState(this.stateHelper());
		});
		this.setState({ featuredProjectURL: await this.getFeaturedProjectURL() });
	}

	private renderMain() {
		const state = flashState.getFlashState();
		const shouldDriveStepBeDisabled = !this.state.hasImage;
		const shouldFlashStepBeDisabled =
			!this.state.hasImage || !this.state.hasDrive;
		const notFlashingOrSplitView =
			!this.state.isFlashing || !this.state.isWebviewShowing;
		return (
			<Flex
				m={`110px ${this.state.isWebviewShowing ? 35 : 55}px`}
				justifyContent="space-between"
			>
				{notFlashingOrSplitView && (
					<>
						<SourceSelector
							flashing={this.state.isFlashing}
							current={this.state.current}
						/>
						<Flex>
							<StepBorder disabled={shouldDriveStepBeDisabled} left />
						</Flex>
						<TargetSelector
							disabled={shouldDriveStepBeDisabled}
							hasDrive={this.state.hasDrive}
							flashing={this.state.isFlashing}
						/>
						<Flex>
							<StepBorder disabled={shouldFlashStepBeDisabled} right />
						</Flex>
					</>
				)}

				{this.state.isFlashing && this.state.isWebviewShowing && (
					<Flex
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: '36.2vw',
							height: '100vh',
							zIndex: 1,
							boxShadow: '0 2px 15px 0 rgba(0, 0, 0, 0.2)',
						}}
					>
						<ReducedFlashingInfos
							imageLogo={this.state.imageLogo}
							imageName={this.state.imageName}
							imageSize={
								typeof this.state.imageSize === 'number'
									? prettyBytes(this.state.imageSize)
									: ''
							}
							driveTitle={this.state.driveTitle}
							driveLabel={this.state.driveLabel}
							style={{
								position: 'absolute',
								color: '#fff',
								left: 35,
								top: 72,
							}}
						/>
					</Flex>
				)}

				<FlashStep
					width={this.state.isWebviewShowing ? '220px' : '200px'}
					goToSuccess={() => this.setState({ current: 'success' })}
					shouldFlashStepBeDisabled={shouldFlashStepBeDisabled}
					isFlashing={this.state.isFlashing}
					step={state.type}
					percentage={state.percentage}
					position={state.position}
					failed={state.failed}
					speed={state.speed}
					eta={state.eta}
					style={{ zIndex: 1 }}
				/>
			</Flex>
		);
	}

	private renderSuccess() {
		return (
			<FinishPage
				goToMain={() => {
					flashState.resetState();
					this.setState({ current: 'main' });
				}}
			/>
		);
	}

	public render() {
		return (
			<ThemedProvider style={{ height: '100%', width: '100%' }}>
				<Flex
					justifyContent="space-between"
					alignItems="center"
					paddingTop="14px"
					style={{
						// Allow window to be dragged from header
						// @ts-ignore
						WebkitAppRegion: 'drag',
						position: 'relative',
						zIndex: 2,
					}}
				>
					<Flex width="100%" alignItems="center" justifyContent="center">
						<EtcherSvg
							style={{
								cursor: 'pointer',
							}}
							onClick={() => openExternal('https://www.letsving.com/')}
							tabIndex={100}
						/>
					</Flex>
				</Flex>

				{this.state.current === 'main'
					? this.renderMain()
					: this.renderSuccess()}
			</ThemedProvider>
		);
	}
}

export default MainPage;
