declare module "pdfjs-dist/webpack.mjs" {
  export * from "pdfjs-dist";
}

declare module "pdfjs-dist/build/pdf.worker.mjs" {
  const workerSource: string;
  export default workerSource;
}
