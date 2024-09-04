
import type {
    OnProgressFunction,
    OnFailFunction,
    MultiDestinationProgress,
    WriteStep

} from 'etcher-sdk/build/multi-write';
import { spawn } from 'child_process';
import type { WriteResult } from './types/types';
import { BlockDevice, MultiDestination, MultiDestinationError, SourceDestination } from 'etcher-sdk/build/source-destination';




interface DiskCopyResult {
    stdout: string;
    stderr: string;
}
interface MultiDestinationProgressWithMessage extends MultiDestinationProgress {
    message: string;
}

function gdopm(message: string, state: ProgressState): MultiDestinationProgress {
    const msg: MultiDestinationProgressWithMessage = {
        ...state,
        message: message
    };
    return msg;
}




interface ProgressState {
    active: number;
    failed: number;
    type: WriteStep;
    size?: number;
    startTime?: any,
    compressedSize?: number;
    blockmappedSize?: number;
    sparse?: boolean;
    rootStreamPosition?: number;
    rootStreamSpeed?: number;
    rootStreamAverageSpeed?: number;
    bytesWritten?: number;
    bytes: number;
    position: number;
    speed: number;
    averageSpeed: number;
    percentage?: number;
    eta?: number;
}


function handleError(state: ProgressState, onProgress: OnProgressFunction) {
    state.failed = 1;
    onProgress(state);
}





const state: ProgressState = {
    active: 1,
    failed: 0,
    type: 'decompressing',
    size: 6442450944,
    bytes: 0,
    position: 0,
    speed: 0,
    averageSpeed: 0,
    bytesWritten: 0,
};



function parseProgressData(data: string, state: ProgressState, onProgress: OnProgressFunction) {

    // const match = data.match(/(\d+) bytes.* copied, (\d+\.\d+) s, (\d+(\.\d+)?) (MB|GB)\/s/);
    const regex = /(\d+) bytes.*\(([\d.]+) (GB|MB), ([\d.]+) (GiB|MiB)\).*copied, (\d+) s, ([\d.]+) MB\/s/;
    // const match = data.match(/(\d+) bytes.*\((\d+) MB, (\d+) MiB\).*copied, (\d+) s, ([\d.]+) MB\/s/);
    const match = data.match(regex)
    console.log("Raw Data:", data);

    if (match) {
        // const [_, bytesCopied, mb, mib, timeSec, speedMBps] = match;
        const [_, bytesCopied, sizeGBMB, sizeUnit, sizeGiBMiB, sizeBinaryUnit, timeSec, speedMBps] = match;
        const bytesProcessed = parseInt(bytesCopied);
        let speed = parseFloat(speedMBps);


        speed *= 1024 * 1024;

        state.bytes = bytesProcessed;
        state.position = bytesProcessed;
        state.speed = speed;
        state.averageSpeed =
            state.bytes / ((Date.now() - (state.startTime || Date.now())) / 1000);

        if (state.size) {
            state.percentage = (bytesProcessed / state.size) * 100;

            if (state.speed > 0) {
                const bytesRemaining = state.size - bytesProcessed;
                state.eta = bytesRemaining / state.speed;
            } else {
                state.eta = 0;
            }
        } else {
            state.percentage = 0;
            state.eta = 0;
        }

        state.bytesWritten = bytesProcessed;
        onProgress(state);
    }
}


function diskCopy(inputFilePath: string, outputFilePath: string, onProgress: OnProgressFunction): Promise<DiskCopyResult> {
    return new Promise(async (resolve, reject) => {
        const lz4cat = spawn('lz4cat', [inputFilePath]);
        const dd = spawn('sudo', ['dd', `of=${outputFilePath}`, 'bs=4M', 'status=progress']);

        state.startTime = Date.now();
        let stdoutData = '';
        let stderrData = '';


        lz4cat.stdout.pipe(dd.stdin)
        dd.stdout.on('data', (data: Buffer) => {
            stdoutData += data.toString();

        });

        dd.stderr.on('data', (data: Buffer) => {
            stderrData += data.toString();
            state.type = 'flashing';
            parseProgressData(data.toString(), state, onProgress);
            onProgress(gdopm(`data===========${data}`, state));

        });

        dd.on('close', (code: number) => {
            if (code === 0) {
                resolve({ stdout: stdoutData, stderr: stderrData });
            } else {
                handleError(state, onProgress);
                reject(new Error(`Process exited with code ${code}\n${stderrData}`));
            }
        });

        dd.on('error', (error: Error) => {
            handleError(state, onProgress);
            reject(error);
        });
    });
}



function writeVingImage({
    inputFilePath,
    outputFilePath,
    destinations,
    onProgress,
    onFail,

}: {
    inputFilePath: string;
    outputFilePath: string;
    destinations: BlockDevice[];
    onProgress: OnProgressFunction;
    onFail: OnFailFunction;

}): Promise<WriteResult> {
    const destination = new MultiDestination(destinations);
    const failures: Map<SourceDestination, Error> = new Map();
    function updateState(step?: WriteStep) {
        if (step !== undefined) {
            state.type = step;
        }
        state.failed = failures.size;
        state.active = destination.destinations.size - state.failed;
    }
    function _onFail(error: MultiDestinationError) {
        failures.set(error.destination, error.error);
        updateState();
        onFail(error.destination, error.error);
    }


    return diskCopy(inputFilePath, outputFilePath, onProgress)
        .then(_result => {

            onProgress(gdopm(`suiiiii`, state));

            const writeResult: WriteResult = {
                bytesWritten: state.bytesWritten,
                devices: {
                    failed: 0,
                    successful: 1,
                },
                errors: [],
                sourceMetadata: {
                    size: state.size,
                    name: inputFilePath,
                }
            };
            state.type = 'finished';
            onProgress(state);
            return writeResult;
        })
        .catch(error => {

            const writeResult: WriteResult = {
                bytesWritten: 0,
                devices: {
                    failed: 1,
                    successful: 0,
                },
                errors: [
                    {
                        message: error.message,
                        code: error.name,
                        description: '',
                        device: '',
                        name: ""
                    }
                ],
                sourceMetadata: {
                    size: 0,
                    name: inputFilePath,
                }
            };


            destination.on('fail', _onFail);
            return writeResult;
        });
}


export { writeVingImage }

