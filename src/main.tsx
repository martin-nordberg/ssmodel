import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App.tsx'
import { GridHarness } from './app/components/grid/GridHarness.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>{new URLSearchParams(location.search).get('harness') === 'grid' ? <GridHarness /> : <App />}</StrictMode>,
)
