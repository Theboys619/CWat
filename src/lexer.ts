import { DimeError, DimeSyntaxError } from "./errors.ts";
import Token, { TokenTypes, Position } from "./token.ts";

export const keywords: Record<string, string> = {
  "func": TokenTypes.Keyword,
  "let": TokenTypes.Keyword,
  "const": TokenTypes.Keyword,
  "return": TokenTypes.Keyword,
  "true": TokenTypes.Keyword,
  "false": TokenTypes.Keyword,
  "if": TokenTypes.Keyword,
  "else": TokenTypes.Keyword,
  "decl": TokenTypes.Keyword,
  "export": TokenTypes.Keyword,
  "extern": TokenTypes.Keyword,
  "define": TokenTypes.Keyword,
  "include": TokenTypes.Keyword,
  "class": TokenTypes.Keyword,
  "new": TokenTypes.Keyword,
  "for": TokenTypes.Keyword,
  "while": TokenTypes.Keyword,
  "break": TokenTypes.Keyword,
  "continue": TokenTypes.Keyword,
};
export const dataTypes: Record<string, string> = {
  "i32": TokenTypes.Datatype,
  "i64": TokenTypes.Datatype,
  "f32": TokenTypes.Datatype,
  "f64": TokenTypes.Datatype,
  "str": TokenTypes.Datatype,
  "char": TokenTypes.Datatype,
  "bool": TokenTypes.Datatype,
};
export const operators: Record<string, string>[] = [
  { // Single Digit Operators
    "=": "=",
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    "%": "%",
    "<": "<",
    ">": ">",
  },
  { // Two Digit Operators
    "+=": "+=",
    "-=": "-=",
    "==": "==",
    "!=": "!=",
    "<=": "<=",
    ">=": ">=",
    "++": "++",
    "--": "--"
  }
];
export const PRECEDENCE: Record<string, number> = {
  "=": 1,
  "+=": 2, "-=": 2, "*-": 2, "/=": 2, "%=": 2,
  "||": 4,
  "&&": 5,
  "++": 6, "--": 6,
  "<": 7, ">": 7, ">=": 7, "<=": 7, "==": 7, "!=": 7,
  "+": 10, "-": 10,
  "*": 20, "/": 20, "%": 20,
};

export const assignments: string[] = [
  "=",
  "+=", "-=", "*=", "/=", "%=",
  "++", "--"
];
export const noRightHand: string[] = [
  "++", "--"
];

export default class Lexer {
  currentFile: string;
  input: string;
  index: number;

  curChar: string;
  pos: Position;

  tokens: Token[];

  constructor(filepath: string = "", input: string = "") {
    this.currentFile = filepath;

    this.input = input;
    this.index = 0;

    this.curChar = this.input.length > 0 ? this.input[this.index] : '\0';
    this.pos = new Position(filepath, 0, 0);

    this.tokens = [];
  }

  set line(num: number) {
    this.pos.line = num;
  }

  set column(num: number) {
    this.pos.column = num;
  }

  get line() {
    return this.pos.line;
  }

  get column() {
    return this.pos.column;
  }

  /**
   * Advances a specified amount of characters from the input.
   * Changes position values and sets the current character.
   */
  advance(amt: number = 1): string {
    this.index += amt;
    this.column += amt;

    if (this.index >= this.input.length) {
      this.curChar = '\0';
      return this.curChar;
    }

    this.curChar = this.input[this.index];
    return this.curChar;
  }

  /**
   * Peeks into the input array from the current input.
   * Returns the peeked character
   */
  peek(amt: number = 1): string {
    if (this.index + amt >= this.input.length)
      return '\0';

    return this.input[this.index + amt];
  }

  /**
   * Grabs all characters from current index + the amount specified and returns a string of those characters
   */
  grab(amt: number = 1): string {
    let value: string = "";
    value += this.curChar;

    for (let i = 1; i < amt; i++)
      value += this.peek();

    return value;
  }

  isWhitespace(c: string): boolean {
    return c == ' ' || c == '\r' || c == '\t';
  }

  isAlpha(c: string): boolean {
    return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') || c == '_';
  }

  isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  isNumber(): boolean {
    return (
      (this.curChar == '-' && this.isDigit(this.peek()))
      || this.isDigit(this.curChar)
    );
  }

  /**
   * Checks to see if a character is a quote.
   * 
   * @param c The character to be checked
   * @param quote The type of quote to check the char against
   */
  isQuote(c: string, quote?: string): boolean {
    if (!quote)
      return c == '\'' || c == '\"';

    if (quote != '"' && quote != '\'')
      return false;

    if (quote == '"')
      return c == '"';
    else if (quote == '\'')
      return c == '\'';

    return false;
  }

  /**
   * Grabs the operator from the current character and checks to see if any other operator fits by using 'grab' plus and incremented i.
   * Then it returns the length of the operator
   * 
   * returning 0 means it is not an operator
   */
  isOperator(): number {
    for (let i = operators.length-1; i >= 0; i--) {
      const opList = operators[i];
      const ops = Object.keys(opList);
      
      for (const key of ops) {
        if (this.grab(i + 1) === key)
          return i + 1;
      }
    }

    return 0;
  }

  isDelimiter(c: string): boolean {
    return (
      (c == '(') ||
      (c == ')') ||
      (c == '[') ||
      (c == ']') ||
      (c == '{') ||
      (c == '}') ||
      (c == ';') ||
      (c == ':') ||
      (c == '.') ||
      (c == ',')
    );
  }

  toNewLine(c: string) {
    return c != '\0' && c != '\n';
  }

  tokenize() {
    while (this.curChar != '\0') {
      const oldIndex = this.index; // For error checking

      if (this.isWhitespace(this.curChar))
        this.advance();
      
      if (this.curChar == '\n') {
        this.tokens.push(new Token(TokenTypes.NewLine, "\\n", this.pos.copy()));
        this.column = -1;
        this.line++;

        this.advance();
      }

      if (this.curChar == '/' && this.peek() == '/') {
        this.advance(2);
          while (this.toNewLine(this.curChar)) {
            this.advance();
          }
      }

      if (this.isOperator() > 0) {
        const opLength: number = this.isOperator();
        const value: string = this.grab(opLength);

        const tok = new Token(TokenTypes.Operator, value, this.pos.copy());
        this.tokens.push(tok);

        this.advance(opLength);
      }

      if (this.isDelimiter(this.curChar)) {
        const tok = new Token(TokenTypes.Delimiter, this.curChar, this.pos.copy());
        this.tokens.push(tok);

        this.advance();
      }

      if (this.isNumber()) {
        const prevPos = this.pos.copy();

        let tType: string = TokenTypes.Integer;
        let val: string = "";

        if (this.curChar == '-') {
          val += this.curChar;
          this.advance();
        }

        while (this.isNumber()) {
          val += this.curChar;
          this.advance();

          if (this.curChar == '.') {
            tType = TokenTypes.Double;
            val += ".";

            this.advance();
          }
        }

        if (this.curChar == 'f') {
          this.advance();

          tType = TokenTypes.Float;
        }

        const tok = new Token(tType, val, prevPos);

        this.tokens.push(tok);
      }

      if (this.isQuote(this.curChar)) {
        let quote: string = this.curChar;
        const prevPos = this.pos.copy();

        let val: string = "";
        this.advance();

        while (this.curChar != '\0' && this.curChar != quote) {
          if (this.curChar == '\n') {
            new DimeSyntaxError(
              "Unexpected character %s",
              this.pos.copy(),
              [`'${this.curChar}'`]
            );
          };
          
          if (this.curChar == "\\") {
            if (this.peek() == "n") {
              val += "\\n";
              this.advance(2);
              
              continue;
            }
          }

          val += this.curChar;
          this.advance();
        }

        this.advance();

        const tokType = quote == "\'" && val.length == 1 ? TokenTypes.Char : TokenTypes.String;
        prevPos.length = val.length + 2;
        const tok = new Token(TokenTypes.String, val, prevPos);

        this.tokens.push(tok);
      }

      if (this.isAlpha(this.curChar)) {
        let val: string = "";

        const prevPos = this.pos.copy();

        while (this.curChar != '\0' && (this.isAlpha(this.curChar) || this.isNumber())) {
          val += this.curChar;
          this.advance();
        }

        let type = keywords.hasOwnProperty(val)
          ? keywords[val]
          : TokenTypes.Identifier;

        if (dataTypes.hasOwnProperty(val)) {
          type = dataTypes[val];
        }

        const tok = new Token(type, val, prevPos);

        this.tokens.push(tok);
      }

      if (oldIndex == this.index) {
        new DimeError("Unknown character %s", this.pos, [`'${this.curChar}'`]);
      }
    }

    return this.tokens;
  }
}