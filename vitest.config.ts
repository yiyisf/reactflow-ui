import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: [
                'src/services/ai/protocolAdapter.ts',
                'src/services/ai/transport.ts',
                'src/services/ai/toolExecutor.ts',
                'src/services/ai/agentRunner.ts',
                'src/services/ai/errorMessages.ts',
                'src/services/ai/draftPersistence.ts',
                'src/utils/validator.ts',
                'src/utils/workflowToMermaid.ts',
                'src/utils/proposalPreview.ts',
                'src/utils/taskTypeMeta.ts',
                'src/parser/conductorParser.ts',
                'src/store/aiStore.ts',
                'src/store/libraryStore.ts',
            ],
        },
    },
});
