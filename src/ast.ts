import Token, { TokenTypes, Position } from "./token.ts";

const astTypeDef = [
  "Null",
  "Pointer",
  "Char",
  "String",
  "Boolean",
  "Integer",
  "Double",
  "Datatype",
  "Function",
  "FunctionDef",
  "FunctionCall",
  "Binary",
  "Assign",
  "Variable",
  "Identifier",
  "Define",
  "Include",
  "If",
  "Else",
  "ForLoop",
  "WhileLoop",
  "Scope",
  "Return",
  "StackAlloc",
  "DataType",
  "ArrayType",
  "GenericType",
  "Extern"
] as const;
export const ASTTypes: Record<typeof astTypeDef[number], typeof astTypeDef[number]> = {
  "Null": "Null",
  "Pointer": "Pointer",
  "Char": "Char",
  "String": "String",
  "Boolean": "Boolean",
  "Integer": "Integer",
  "Double": "Double",
  "Datatype": "Datatype",
  "Function": "Function",
  "FunctionDef": "FunctionDef",
  "FunctionCall": "FunctionCall",
  "Binary": "Binary",
  "Assign": "Assign",
  "Variable": "Variable",
  "Identifier": "Identifier",
  "Define": "Define",
  "Include": "Include",
  "If": "If",
  "Else": "Else",
  "ForLoop": "ForLoop",
  "WhileLoop": "WhileLoop",
  "Scope": "Scope",
  "Return": "Return",
  "StackAlloc": "StackAlloc",
  "DataType": "DataType",
  "ArrayType": "ArrayType",
  "GenericType": "GenericType",
  "Extern": "Extern"
};

export default class AST {
  kind: string;
  value: Token;
  dataType!: AST;
  arrayPtr: number = 0;

  left!: AST;
  op!: Token;
  right!: AST;

  block!: AST[];
  args!: AST[];

  assign!: AST;
  condition!: AST;
  els!: AST;

  access!: AST;
  parent!: AST;

  isOpBefore: boolean = false;
  isConst: boolean = false;
  isExtern: boolean = false;
  isExported: boolean = false;
  isSubscript: boolean = false;

  constructor(kind: string = "Null", value: Token = new Token()) {
    this.kind = kind;
    this.value = value;
  }
};