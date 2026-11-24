import {
  ConsoleTemplate,
  DashboardTemplate,
  EditorTemplate,
  Kpi,
  ListTreeTemplate,
  RegisterTemplate,
  ReportTemplate,
  Tile,
} from '@/app/components/templates/templates.tsx'
import { goalStatusClass, phaseHue, seriesColors, varianceClass } from '@/app/theme/tokens.ts'
import { formatCents, formatDate, formatDollars, formatPercent } from '@/lib/format.ts'
import { PageHeader } from '../PageHeader.tsx'

// A gallery of the page templates and semantic colors [FR-UI-27, FR-UI-29], for checking the visual system in both
// themes. Addressable at #/help/gallery; not in the menus.

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="size-4 rounded" style={{ background: color }} aria-hidden />
      {label}
    </li>
  )
}

function Example({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section aria-label={`${name} template`} className="flex flex-col gap-1">
      <h3 className="font-medium text-sm">{name}</h3>
      <div className="flex h-56 flex-col overflow-hidden rounded border border-dashed p-2">{children}</div>
    </section>
  )
}

export function TemplateGalleryPage() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <PageHeader title="Page templates" description="The visual system: templates, colors and number formats." />

      <section aria-label="Colors" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <h3 className="mb-1 font-medium text-sm">Meaning</h3>
          <ul className="grid gap-1">
            <Swatch label="Actual" color="var(--actual)" />
            <Swatch label="Projected" color="var(--projected)" />
            <Swatch label="Today" color="var(--today)" />
            <Swatch label="Warning" color="var(--warning)" />
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-medium text-sm">Variance and goals</h3>
          <ul className="grid gap-1 text-xs">
            <li className={varianceClass(true)}>Favorable {formatCents(12345, { plus: true })}</li>
            <li className={varianceClass(false)}>Unfavorable {formatCents(-12345)}</li>
            <li className={goalStatusClass['on-track']}>On track</li>
            <li className={goalStatusClass['at-risk']}>At risk</li>
            <li className={goalStatusClass['off-track']}>Off track</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-medium text-sm">Phases</h3>
          <ul className="grid gap-1">
            {Object.entries(phaseHue).map(([id, color]) => (
              <Swatch key={id} label={id} color={color} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-medium text-sm">Series</h3>
          <ul className="grid gap-1">
            {seriesColors.map((c, i) => (
              <Swatch key={c} label={`Series ${i + 1}`} color={c} />
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Formats" className="text-sm tabular-nums">
        <h3 className="mb-1 font-medium text-sm">Formats</h3>
        <p>
          {formatCents(-123456)} · {formatDollars(2_500_000, { compact: true })} · {formatPercent(0.0525)} ·{' '}
          {formatDate('2026-11-23')}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Example name="List or tree">
          <ListTreeTemplate
            label="Accounts"
            toolbar={<span>Toolbar</span>}
            list={<p>Tree</p>}
            detail={<p>Details</p>}
          />
        </Example>
        <Example name="Register">
          <RegisterTemplate label="Transactions" filters={<span>Filters</span>} grid={<p>Grid</p>} footer="Totals" />
        </Example>
        <Example name="Editor">
          <EditorTemplate label="Budget" editor={<p>Grid or form</p>} inspector={<p>Inspector</p>} />
        </Example>
        <Example name="Report">
          <ReportTemplate label="Report" filters={<span>Filters</span>} chart={<p>Chart</p>} table={<p>Table</p>} />
        </Example>
        <Example name="Console">
          <ConsoleTemplate
            levers={<p>Levers</p>}
            kpis={
              <>
                <Kpi label="Success" value={formatPercent(0.92)} />
                <Kpi label="Lifetime" value={formatDollars(1_234_567, { compact: true })} />
              </>
            }
            chart={<p>Chart</p>}
          />
        </Example>
        <Example name="Dashboard">
          <DashboardTemplate>
            <Tile title="Net worth" value={formatCents(123456789)} note="As of today" />
            <Tile title="Budget" value={formatPercent(0.62)} note="Spent of this year's budget" />
          </DashboardTemplate>
        </Example>
      </div>
    </div>
  )
}
