const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/g;

const OSC_PATTERN = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const C0_PATTERN = /[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g;

// Some providers emit detached control tokens without the ESC prefix.
const DETACHED_CSI_PATTERN = /\[(?:\?|\d)[0-9;]*[A-Za-z]/g;
const DETACHED_SGR_PATTERN = /\[(?:\d{1,3};){1,12}\d{1,3}m/g;
const OSC_REMAINDER_PATTERN = /\]\d+;[^\n\u0007]*(?:\u0007)?/g;
const LINE_NOISE_PATTERN = /^[\s[\]0-9;?=><:.,'"\-\\/_|`~+()*]+$/;
const BLOCK_CHARS_PATTERN = /[░▒▓█▁▂▃▄▅▆▇▉▊▋▌▍▎▏]/g;

const shouldDropLine = (line: string) => {
  if (!line.trim()) {
    return true;
  }

  if (LINE_NOISE_PATTERN.test(line) && line.length > 8) {
    return true;
  }

  const blockCharCount = (line.match(BLOCK_CHARS_PATTERN) || []).length;
  if (blockCharCount > 16) {
    return true;
  }

  const looksLikeAnsiResidue = /\d{1,3};\d{1,3};\d{1,3}/.test(line);
  if (looksLikeAnsiResidue && line.length > 40) {
    return true;
  }

  if (line.length > 320 && !/[a-zA-Z]/.test(line)) {
    return true;
  }

  return false;
};

export const stripAnsi = (input: string) =>
  input
    .replace(OSC_PATTERN, "")
    .replace(ANSI_PATTERN, "")
    .replace(DETACHED_CSI_PATTERN, "")
    .replace(DETACHED_SGR_PATTERN, "")
    .replace(OSC_REMAINDER_PATTERN, "")
    .replace(C0_PATTERN, "");

export const sanitizePtyOutput = (input: string) => {
  const cleaned = stripAnsi(input).replace(/\r/g, "");
  const lines = cleaned
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !shouldDropLine(line));

  return lines.join("\n").trim();
};
