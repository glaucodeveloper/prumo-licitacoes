// Install the compatibility method in the isolated worker realm before the
// PDF.js worker module evaluates.
import './compat.mjs';

const workerModule = await import('./pdf.worker.mjs');
export const WorkerMessageHandler = workerModule.WorkerMessageHandler;
