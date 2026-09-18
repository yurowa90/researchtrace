export const operationLabels = { promote:"진급", transfer:"학급 이동", graduate:"졸업 처리", restore:"재학 상태 복원", assign_teacher:"담임 변경" } as const;
export type OperationKind = keyof typeof operationLabels;
