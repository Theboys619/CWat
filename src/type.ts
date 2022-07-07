import Token, { TokenTypes, Position } from "./token.ts";
import { DimeError, DimeSyntaxError } from "./errors.ts";
import AST, { ASTTypes } from "./ast.ts";

const conversions: Record<string, string> = {
  "i32": "i32",
  "f32": "f32",
  "f64": "f64",
  "i64": "i64",
  "char": "i32",
  "bool": "i32",
  "str": "i32",
  "void": "void"
}

// Array<int>
// int[5]
// Object<int, float>
// Array<Object<int, float>>
// int[3][3]

export class Type {
  value: string;
  token: Token;

  subTypes: Type[];
  isArray: boolean;
  isGeneric: boolean;

  constructor(token: Token, isArray: boolean = false, isGeneric: boolean = false) {
    this.value = token.value;
    this.token = token;

    this.isArray = isArray;
    this.isGeneric = isGeneric;

    this.subTypes = [];
  }

  addSubType(subType: Type, isArray: boolean = false) {
    if (this.isArray)
      this.isArray = isArray;
    
    this.subTypes.push(subType);
  }

  toString(): string {
    let typeString = this.value; // int

    if (this.subTypes.length > 0) {
      if (this.isArray) {
        typeString += "[";
      } else {
        typeString += "<";
      }
    }

    let isFirst = true;
    for (const dataType of this.subTypes) {
      if (isFirst) {
        isFirst = false;
      } else {
        typeString += ", ";
      }
      typeString += dataType.toString();
    }

    if (this.subTypes.length > 0) {
      if (this.isArray) {
        typeString += "]";
      } else {
        typeString += ">";
      }
    }

    return typeString;
  }

  compareTo(o: Type): boolean {
    return this.toString() == o.toString();
  }

  convertType(): string {
    if (this.subTypes.length > 0)
      return "i32";

    if (!conversions.hasOwnProperty(this.value))
      return "i32";

    return conversions[this.value];
  }
};