import * as React from 'react';
import { Flex } from 'rendition';
import { v4 as uuidV4 } from 'uuid';
import * as flashState from '../../models/flash-state';
import * as selectionState from '../../models/selection-state';
import * as settings from '../../models/settings';
import { Actions, store } from '../../models/store';
import * as analytics from '../../modules/analytics';
import { FlashAnother } from '../flash-another/flash-another';
import type { FlashError } from '../flash-results/flash-results';
import { FlashResults } from '../flash-results/flash-results';

function restart(goToMain: () => void) {
	selectionState.deselectAllDrives();
	analytics.logEvent('Restart');

	// Reset the flashing workflow uuid
	store.dispatch({
		type: Actions.SET_FLASHING_WORKFLOW_UUID,
		data: uuidV4(),
	});

	goToMain();
}

async function getSuccessBannerURL() {
	return (
		(await settings.get('successBannerURL')) ??
		'https://efp.balena.io/success-banner?borderTop=false&darkBackground=true'
	);
}

function FinishPage({ goToMain }: { goToMain: () => void }) {
	const [webviewShowing, setWebviewShowing] = React.useState(false);
	const [successBannerURL, setSuccessBannerURL] = React.useState('');
	(async () => {
		setSuccessBannerURL(await getSuccessBannerURL());
	})();
	const flashResults = flashState.getFlashResults();
	const errors: FlashError[] = (
		store.getState().toJS().failedDeviceErrors || []
	).map(([, error]: [string, FlashError]) => ({
		...error,
	}));
	const { averageSpeed, blockmappedSize, bytesWritten, failed, size } =
		flashState.getFlashState();
	const {
		skip,
		results = {
			bytesWritten,
			sourceMetadata: {
				size,
				blockmappedSize,
			},
			averageFlashingSpeed: averageSpeed,
			devices: { failed, successful: 0 },
		},
	} = flashResults;
	return (
		<Flex height="100%" justifyContent="space-between">
			<Flex
				width={webviewShowing ? '36.2vw' : '100vw'}
				height="100vh"
				alignItems="center"
				justifyContent="center"
				flexDirection="column"
				style={{
					position: 'absolute',
					top: 0,
					zIndex: 1,
					boxShadow: '0 2px 15px 0 rgba(0, 0, 0, 0.2)',
				}}
			>
				<FlashResults
					image={selectionState.getImage()?.name}
					results={results}
					skip={skip}
					errors={errors}
					mb="32px"
					goToMain={goToMain}
				/>

				<FlashAnother
					onClick={() => {
						restart(goToMain);
					}}
				/>
			</Flex>
		</Flex>
	);
}

export default FinishPage;
