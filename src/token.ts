const arrTokenType = [
  "Null",
  "Char",
  "Pointer",
  "String",
  "Boolean",
  "Integer",
  "Double",
  "Float",
  "Datatype",
  "Keyword",
  "Identifier",
  "Delimiter",
  "Operator",
  "NewLine",
  "EndOfFile"
] as const;

export const TokenTypes: Record<typeof arrTokenType[number], string> = {
  "Null": "Null",
  "Char": "Char",
  "Pointer": "Pointer",
  "String": "String",
  "Boolean": "Boolean",
  "Integer": "Integer",
  "Double": "Double",
  "Float": "Float",
  "Datatype": "Datatype",
  "Keyword": "Keyword",
  "Identifier": "Identifier",
  "Delimiter": "Delimiter",
  "Operator": "Operator",
  "NewLine": "NewLine",
  "EndOfFile": "EndOfFile"
};

export class Position {
  file: string;
  line: number;
  column: number;
  length: number;

  constructor(file: string = "Unknown", line: number = 0, column: number = 0, length: number = -1) {
    this.file = file;
    this.line = line;
    this.column = column;
    this.length = length;
  }

  copy() {
    return new Position(this.file, this.line, this.column, this.length);
  }

  toString(): string {
    return `${this.file}:${this.line}:${this.column}`;
  }
};

export default class Token {
  kind: string;
  value: string;

  pos: Position;

  constructor(kind: string = "Null", value: string = "null", pos: Position = new Position()) {
    this.kind = kind;
    this.value = value;
    this.pos = pos;
    this.pos.length = pos.length === -1 ? this.value.length : pos.length;
  }

  equals(kind?: string | undefined | null, value?: string | undefined | null) {
    if (!kind && value)
      return this.value === value;
    
    if (kind && !value)
      return this.kind === kind;

    if (!kind && !value)
      return false;

    return this.kind === kind && this.value === value;
  }

  isNull(): boolean {
    return this.kind === "Null";
  }

  toString(): string {
    return `Token<${this.kind}, '${this.value}'}`;
  }
};