import { exec } from 'child_process';
import cap from 'cap';

const VIRTUAL_KEYWORDS = ['zerotier', 'vmware', 'hyper-v', 'virtual', 'loopback', 'tap', 'bluetooth', 'wan miniport'];

/**
 * Checks if a network adapter is virtual based on its name.
 * @param {string} name The description or name of the network device.
 * @returns {boolean} True if the device name indicates it's a virtual adapter.
 */
function isVirtual(name) {
    const lower = name.toLowerCase();
    return VIRTUAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Detects TCP traffic on a network adapter for 3 seconds.
 * @param {number} deviceIndex The index of the device.
 * @param {Object} devices A map of network devices.
 * @returns {Promise<number>} A promise that resolves with the number of packets detected.
 */
export function detectTraffic(deviceIndex, devices) {
    return new Promise((resolve) => {
        let count = 0;
        let c;

        const cleanup = () => {
            if (c) {
                try {
                    c.close();
                } catch (e) {
                    console.error('Error closing capture device:', e);
                }
            }
        };

        const timeoutId = setTimeout(() => {
            cleanup();
            resolve(count);
        }, 3000);

        try {
            // Check if the device exists before proceeding
            if (!devices[deviceIndex] || !devices[deviceIndex].name) {
                console.error(`Invalid device index: ${deviceIndex}`);
                clearTimeout(timeoutId);
                resolve(0);
                return;
            }

            c = new cap.Cap();
            const buffer = Buffer.alloc(65535);

            console.log(`Attempting to open device: ${devices[deviceIndex].name}`);
            const openResult = c.open(devices[deviceIndex].name, 'ip and tcp', 1024 * 1024, buffer);
            console.log(`Open result for ${devices[deviceIndex].name}: ${openResult}`);

            if (openResult) {
                // Check if open was successful (returns a string on success)
                try {
                    c.on('packet', () => {
                        try {
                            count++;
                        } catch (e) {
                            console.error('An error occurred inside the packet handler:', e);
                        }
                    });
                    console.log('in');
                } catch (e) {
                    console.error(`Failed to attach packet listener to device ${devices[deviceIndex].name}:`, e);
                    cleanup();
                    clearTimeout(timeoutId);
                    resolve(0);
                }
            } else {
                console.warn(`Failed to open device ${devices[deviceIndex].name}. Result was:`, openResult);
                cleanup();
                clearTimeout(timeoutId);
                resolve(0);
            }
        } catch (e) {
            console.error(
                `A critical error occurred while attempting to open device ${devices[deviceIndex]?.name || 'N/A'}:`,
                'This may be due to a lack of administrator privileges. Please try running the application as an administrator.',
                e
            );
            cleanup();
            clearTimeout(timeoutId);
            resolve(0);
        }
    });
}

/**
 * Finds the default network device using the system's route table.
 * This function is specifically for Windows.
 * @param {Object} devices A map of network devices.
 * @returns {Promise<number|undefined>} A promise that resolves with the device index or undefined.
 */
export async function findByRoute(devices) {
    try {
        const stdout = await new Promise((resolve, reject) => {
            exec('route print 0.0.0.0', (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        const defaultInterface = stdout
            .split('\n')
            .find((line) => line.trim().startsWith('0.0.0.0'))
            ?.trim()
            .split(/\s+/)[3];

        if (!defaultInterface) {
            return undefined;
        }

        const targetInterface = Object.keys(devices).find((key) =>
            devices[key].addresses.find((address) => address.addr === defaultInterface)
        );

        if (!targetInterface) {
            return undefined;
        }

        return parseInt(targetInterface, 10);
    } catch (error) {
        console.error('Failed to find device by route:', error);
        return undefined;
    }
}

/**
 * Finds the most suitable default network device by using the system's route table.
 * @param {Object} devices A map of network devices.
 * @returns {Promise<number|undefined>} The index of the default network device.
 */
export async function findDefaultNetworkDevice(devices) {
    console.log('Auto detecting default network interface via route table...');
    try {
        const routeIndex = await findByRoute(devices);

        if (routeIndex !== undefined) {
            console.log(`Using adapter from route table: ${routeIndex} - ${devices[routeIndex].description}`);
        } else {
            console.log('Could not find a default network interface via route table.');
        }

        return routeIndex;
    } catch (error) {
        console.error(
            'An error occurred during device lookup. Please ensure your system is properly configured.',
            error
        );
        return undefined;
    }
}
