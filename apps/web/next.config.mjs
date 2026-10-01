/** @type {import('next').NextConfig} */
export default {
  // StrictMode double-invokes effects in dev, which would tear down the Yjs
  // provider after Monaco's onMount has already run once. Keep it off for now.
  reactStrictMode: false,
};
