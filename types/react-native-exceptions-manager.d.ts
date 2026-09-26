// react-native ships no typings for this private module (only
// types_generated/, used under the strict API). Declares just what
// app/_layout.tsx wraps: the default export's mutable handleException
// (node_modules/react-native/Libraries/Core/ExceptionsManager.js:283-289).
declare module 'react-native/Libraries/Core/ExceptionsManager' {
  const ExceptionsManager: {
    handleException: (error: unknown, isFatal: boolean) => void;
  };
  export default ExceptionsManager;
}
