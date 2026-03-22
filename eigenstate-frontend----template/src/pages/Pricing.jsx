import React from 'react';
import { motion } from 'framer-motion';

const MotionArticle = motion.article;
const MotionDiv = motion.div;
import { Check, Globe, Shield, Zap } from 'lucide-react';

const tiers = [
  {
    name: 'Developer',
    price: '$0',
    description: 'Explore public repos and core reasoning.',
    features: ['Public ingestion', 'Standard pipeline', 'Basic staleness', 'Community support', 'Confidence scoring'],
    icon: Globe,
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/mo',
    description: 'Private repos, deeper patterns, and priority API.',
    features: [
      'Private repositories',
      'Advanced pattern detection',
      'Unlimited lineage queries',
      'Priority API',
      'Custom confidence tiers',
      'Suggested PR descriptions',
    ],
    icon: Zap,
    cta: 'Go Pro',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Self-hosted memory and enterprise controls.',
    features: ['Self-hosted', 'Graph expansion', 'Slack & Jira', 'Dedicated infra', 'SSO', '24/7 support'],
    icon: Shield,
    cta: 'Contact sales',
    highlight: false,
  },
];

const comparison = [
  { feature: 'Public repo ingestion', dev: true, pro: true, ent: true },
  { feature: 'Private repositories', dev: false, pro: true, ent: true },
  { feature: 'Lineage queries', dev: 'Standard', pro: 'Unlimited', ent: 'Unlimited' },
  { feature: 'API priority', dev: '—', pro: 'Yes', ent: 'Dedicated' },
  { feature: 'Self-hosted', dev: '—', pro: '—', ent: 'Yes' },
  { feature: 'SSO / custom auth', dev: '—', pro: '—', ent: 'Yes' },
];

export default function Pricing() {
  return (
    <div className="es-page custom-scrollbar min-h-full overflow-y-auto px-6 py-10 md:px-10 md:py-12">
      <div className="es-container max-w-5xl space-y-12 pb-20">
        <header className="mx-auto max-w-2xl text-center space-y-3">
          <p className="es-overline text-github-blue">Pricing</p>
          <h1 className="es-h1 text-white md:text-4xl">Plans for every stage</h1>
          <p className="es-body">
            EigenState scales from open-source exploration to institutional deployments. Pro is the default choice for
            serious teams.
          </p>
        </header>

        <MotionDiv
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="grid gap-6 md:grid-cols-3"
        >
          {tiers.map((tier) => {
            const Icon = tier.icon;
            return (
              <MotionArticle
                key={tier.name}
                variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.2 }}
                className={`relative flex flex-col rounded-xl border p-6 transition-colors duration-150 ${
                  tier.highlight
                    ? 'border-github-blue/50 bg-github-bg-tertiary ring-1 ring-github-blue/20'
                    : 'border-github-border bg-github-bg-tertiary hover:border-[#444c56]'
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-github-blue px-3 py-0.5 text-[11px] font-semibold text-white">
                    Recommended
                  </span>
                )}
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-github-border bg-github-bg-secondary text-github-blue">
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <h2 className="text-lg font-semibold text-white">{tier.name}</h2>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-white">{tier.price}</span>
                  {tier.period && <span className="text-sm text-github-text-secondary">{tier.period}</span>}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-github-text-secondary">{tier.description}</p>
                <ul className="my-6 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-github-text-primary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={
                    tier.highlight ? 'es-btn es-btn-primary w-full justify-center' : 'es-btn es-btn-secondary w-full justify-center'
                  }
                >
                  {tier.cta}
                </button>
              </MotionArticle>
            );
          })}
        </MotionDiv>

        <section className="space-y-4">
          <h2 className="es-h2 text-white">Compare</h2>
          <div className="overflow-x-auto rounded-xl border border-github-border">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-github-border bg-github-bg-secondary">
                  <th className="px-4 py-3 font-medium text-github-text-secondary">Capability</th>
                  <th className="px-4 py-3 font-medium text-github-text-secondary">Developer</th>
                  <th className="px-4 py-3 font-semibold text-github-blue">Pro</th>
                  <th className="px-4 py-3 font-medium text-github-text-secondary">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.feature} className="border-b border-github-border/80 bg-github-bg-tertiary last:border-0">
                    <td className="px-4 py-3 text-github-text-primary">{row.feature}</td>
                    <td className="px-4 py-3 text-github-text-secondary">
                      {typeof row.dev === 'boolean' ? (row.dev ? <Check className="h-4 w-4 text-emerald-400" /> : '—') : row.dev}
                    </td>
                    <td className="px-4 py-3 bg-github-blue/5 font-medium text-github-text-primary">
                      {typeof row.pro === 'boolean' ? (row.pro ? <Check className="h-4 w-4 text-emerald-400" /> : '—') : row.pro}
                    </td>
                    <td className="px-4 py-3 text-github-text-secondary">
                      {typeof row.ent === 'boolean' ? (row.ent ? <Check className="h-4 w-4 text-emerald-400" /> : '—') : row.ent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
