declare module 'node-sql-parser' {
  export type AST = any;
  export class Parser {
    constructor(options?: any);
    astify(sql: string | any, options?: any): any;
    sqlify(ast: any, options?: any): string;
  }
  export default Parser;
}
