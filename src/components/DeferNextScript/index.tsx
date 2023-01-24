import { NextScript } from 'next/document'

function dedupe<T extends { file: string }>(bundles: T[]): T[] {
  const files = new Set<string>()
  const kept: T[] = []

  for (const bundle of bundles) {
    if (files.has(bundle.file)) continue
    files.add(bundle.file)
    kept.push(bundle)
  }
  return kept
}

type DocumentFiles = {
  sharedFiles: readonly string[]
  pageFiles: readonly string[]
  allFiles: readonly string[]
}

type CrossOrigin = '' | 'anonymous' | 'use-credentials' | undefined

/**
 * Custom NextScript to defer loading of unnecessary JS.
 * Standard behavior is async. Compatible with Next.js 10.0.3
 */
class DeferNextScript extends NextScript {
  crossOrigin: CrossOrigin = (this.props.crossOrigin ||
    process.env.__NEXT_CROSS_ORIGIN) as CrossOrigin
  getDynamicChunks(files: DocumentFiles) {
    const {
      dynamicImports,
      assetPrefix,
      isDevelopment,
      devOnlyCacheBusterQueryString,
    } = this.context

    return dedupe(dynamicImports.map((i) => ({ file: i }))).map((bundle) => {
      if (!bundle.file.endsWith('.js') || files.allFiles.includes(bundle.file))
        return null

      return (
        <script
          key={bundle.file}
          crossOrigin={this.crossOrigin}
          defer={!isDevelopment}
          nonce={this.props.nonce}
          src={`${assetPrefix}/_next/${encodeURI(
            bundle.file,
          )}${devOnlyCacheBusterQueryString}`}
        />
      )
    })
  }
  getScripts(files: DocumentFiles) {
    const {
      assetPrefix,
      buildManifest,
      isDevelopment,
      devOnlyCacheBusterQueryString,
    } = this.context

    const normalScripts = files.allFiles.filter((file) => file.endsWith('.js'))
    const lowPriorityScripts = buildManifest.lowPriorityFiles?.filter((file) =>
      file.endsWith('.js'),
    )

    return [...normalScripts, ...lowPriorityScripts].map((file) => (
      <script
        key={file}
        crossOrigin={this.crossOrigin}
        defer={!isDevelopment}
        nonce={this.props.nonce}
        src={`${assetPrefix}/_next/${encodeURI(
          file,
        )}${devOnlyCacheBusterQueryString}`}
      />
    ))
  }
}

export default DeferNextScript
