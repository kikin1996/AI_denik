import nextConfig from "eslint-config-next";

// mobile/ is a separate Expo/React Native project (own package.json,
// own `npx expo lint`) and must not be linted with the Next.js web app's
// config — different react-hooks plugin version, different globals.
const eslintConfig = [{ ignores: ["mobile/**"] }, ...nextConfig];

export default eslintConfig;
