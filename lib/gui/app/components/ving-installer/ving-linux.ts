import { spawn } from 'child_process';
import { env } from 'process';

const SUCCESSFUL_AUTH_MARKER = 'AUTHENTICATION SUCCEEDED';

export async function sudo(
    command: string,
    { name }: { name: string },
): Promise<{ cancelled: boolean; stdout?: string; stderr?: string }> {
    const parameters = [
        'sudo',
        '-n', 
        '/bin/bash',
        '-c',
        `echo ${SUCCESSFUL_AUTH_MARKER} && ${command}`
    ];

    return new Promise((resolve, reject) => {
        const elevateProcess = spawn(parameters[0], parameters.slice(1), { env: { PATH: env.PATH } });

        let elevated = '';

        elevateProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes(SUCCESSFUL_AUTH_MARKER)) {
                elevated = 'granted';
            } else {
                elevated = 'refused';
            }
        });

        elevateProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data.toString()}`);
        });

        const checkElevation = setInterval(() => {
            if (elevated === 'granted') {
                clearInterval(checkElevation);
                resolve({ cancelled: false });
            } else if (elevated === 'refused') {
                clearInterval(checkElevation);
                resolve({ cancelled: true });
            }
        }, 300);

        setTimeout(() => {
            clearInterval(checkElevation);
            reject(new Error('Elevation timeout'));
        }, 30000);
    });
}
