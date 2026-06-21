/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // emit static files to ./out for S3/CloudFront hosting
  trailingSlash: true, // emit /login/index.html etc. — pairs with the CloudFront URL-rewrite function
};

export default nextConfig;
