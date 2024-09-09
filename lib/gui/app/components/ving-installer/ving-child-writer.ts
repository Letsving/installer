import type { MultiDestinationProgress } from 'etcher-sdk/build/multi-write';
import { DECOMPRESSED_IMAGE_PREFIX } from 'etcher-sdk/build/multi-write';
import { cleanupTmpFiles } from 'etcher-sdk/build/tmp';
import { SourceDestination } from 'etcher-sdk/build/source-destination';
import { File, Http, BlockDevice } from 'etcher-sdk/build/source-destination';

import axios from 'axios';
import { omit } from 'lodash';
import { writeVingImage } from './ving-image-writer';
import { WriteOptions } from '../../../../util/types/types';
import { isJson } from '../../../../shared/utils';
import { toJSON } from '../../../../shared/errors';
import { emitLog, emitState, emitFail } from '../../../../util/api';

async function write(options: WriteOptions) {
	/**
	 * @summary Failure handler (non-fatal errors)
	 * @param {SourceDestination} destination - destination
	 * @param {Error} error - error
	 */
	const onFail = (destination: SourceDestination, error: Error) => {
		emitFail({
			// TODO: device should be destination

			// @ts-ignore (destination.drive is private)
			device: destination.drive,
			error: toJSON(error),
		});
	};

	/**
	 * @summary Progress handler
	 * @param {Object} state - progress state
	 * @example
	 * writer.on('progress', onProgress)
	 */
	const onProgress = (state: MultiDestinationProgress) => {
		emitState(state);
	};

	// Write the image to the destinations
	const destinations = options.destinations.map((d) => d.device);
	const imagePath = options.image.path;
	emitLog(`Image: ${imagePath}`);
	emitLog(`Devices: ${destinations.join(', ')}`);
	emitLog(`Auto blockmapping: ${options.autoBlockmapping}`);
	emitLog(`Decompress first: ${options.decompressFirst}`);
	const dests = options.destinations.map((destination) => {
		return new BlockDevice({
			drive: destination,
			unmountOnSuccess: true,
			write: true,
			direct: true,
		});
	});
	const { SourceType } = options;
	try {
		let source;
		if (options.image.drive) {
			source = new BlockDevice({
				drive: options.image.drive,
				direct: !options.autoBlockmapping,
			});
		} else {
			if (SourceType === File.name) {
				source = new File({
					path: imagePath,
				});
			} else {
				const decodedImagePath = decodeURIComponent(imagePath);
				if (isJson(decodedImagePath)) {
					const imagePathObject = JSON.parse(decodedImagePath);
					source = new Http({
						url: imagePathObject.url,
						avoidRandomAccess: true,
						axiosInstance: axios.create(omit(imagePathObject, ['url'])),
						auth: options.image.auth,
					});
				} else {
					source = new Http({
						url: imagePath,
						avoidRandomAccess: true,
						auth: options.image.auth,
					});
				}
			}
		}

		const results = await writeVingImage({
			inputFilePath: (source as File).path,
			outputFilePath: dests[0].path,
			destinations: dests,

			onProgress,
			onFail,
		});

		return results;
	} catch (error: any) {
		return { errors: [error] };
	}
}

/** @summary clean up tmp files */
export async function cleanup(until: number) {
	await cleanupTmpFiles(until, DECOMPRESSED_IMAGE_PREFIX);
}

export { write };
