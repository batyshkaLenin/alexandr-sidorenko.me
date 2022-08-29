import { Head, Html, Main } from 'next/document'
import { FC } from 'react'
import DeferNextScript from "../components/DeferNextScript";

const Document: FC = () => (
  <Html lang='ru'>
    <Head />
    <body>
      <Main />
      <DeferNextScript />
    </body>
  </Html>
)

export default Document
