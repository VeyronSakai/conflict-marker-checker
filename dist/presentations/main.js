import { createCheckPullRequestUseCase } from '../infrastructures/factories/diContainer.js';
/**
 * GitHub Action main entry point
 *
 * @returns Resolves when the action is complete.
 */
export async function run() {
    const executeUseCase = createCheckPullRequestUseCase();
    await executeUseCase();
}
