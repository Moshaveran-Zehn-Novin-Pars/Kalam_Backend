module.exports = {
    projects: [
        {
            displayName: 'unit',
            testMatch: ['<rootDir>/src/**/*.spec.ts'],
            transform: {
                '^.+\\.(t|j)s$': 'ts-jest',
            },
            collectCoverageFrom: [
                'src/**/*.ts',
                '!src/**/*.spec.ts',
                '!src/**/*.e2e-spec.ts',
                '!src/main.ts',
                '!src/**/*.module.ts',
                '!src/**/*.dto.ts',
                '!src/**/*.entity.ts',
                '!src/infrastructure/prisma/prisma.service.ts',
            ],
            coverageDirectory: 'coverage/unit',
            testEnvironment: 'node',
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
            },
        },
        {
            displayName: 'e2e',
            testMatch: [
                '<rootDir>/test/**/*.e2e-spec.ts',
            ],
            transform: {
                '^.+\\.(t|j)s$': 'ts-jest',
            },
            coverageDirectory: 'coverage/e2e',
            testEnvironment: 'node',
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
            },
        },
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },
};