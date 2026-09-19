let resolver: ((id: string, page: number) => Promise<string>) | undefined;
export const setReferenceBookResolver = (value: (id: string, page: number) => Promise<string>) => { resolver = value; };
export const getReferenceBookResolver = () => resolver;
