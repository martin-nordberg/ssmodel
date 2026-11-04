import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App.tsx'
import { GridHarness } from './app/components/grid/GridHarness.tsx'
import { McHarness } from './app/McHarness.tsx'

function Root() {
  const harness = new URLSearchParams(location.search).get('harness')
  if (harness === 'grid') return <GridHarness />
  if (harness === 'mc') return <McHarness />
  return <App />
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
