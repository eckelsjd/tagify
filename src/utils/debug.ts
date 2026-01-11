// SET TO FALSE BEFORE RELEASING
const DEBUG_MODE = true;

export const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};