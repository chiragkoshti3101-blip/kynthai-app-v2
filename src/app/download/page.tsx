import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Smartphone, Bell, Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Download Kynthai for Android',
  description: 'Official Android APK — reliable medication reminders and notifications when the app is closed.',
}

const APK = '/downloads/kynthai-android.apk'

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[#f9fdfb] text-slate-900">
      <div className="mx-auto max-w-lg px-5 py-12 space-y-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg">
            <Smartphone className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Download Kynthai</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Official Android app for medication reminders, family care, doctor and lab alerts —
            built so notifications work more reliably when the phone is locked.
          </p>
        </div>

        <a
          href={APK}
          download="Kynthai.apk"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-base font-semibold text-white shadow-md hover:bg-emerald-700"
        >
          <Download className="h-5 w-5" />
          Download Android APK
        </a>

        <ul className="space-y-3 text-sm text-slate-700">
          <li className="flex gap-3 rounded-xl border border-emerald-100 bg-white p-3">
            <Bell className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              <strong>Better closed-app alerts</strong> — allow notifications after install for dose,
              doctor, and lab updates.
            </span>
          </li>
          <li className="flex gap-3 rounded-xl border border-emerald-100 bg-white p-3">
            <Shield className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              <strong>Official build</strong> from kynthai.app. Android may ask you to allow installs
              from your browser — that is normal for APKs outside Play Store.
            </span>
          </li>
        </ul>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 space-y-2 leading-relaxed">
          <p className="font-semibold text-slate-800">Install steps</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Tap Download Android APK</li>
            <li>Open the downloaded file</li>
            <li>Tap Install (allow “unknown apps” for Chrome/Files if asked)</li>
            <li>Open Kynthai → Allow notifications</li>
            <li>Sign in with your account</li>
          </ol>
          <p className="pt-2">
            iPhone: use Safari → Share → Add to Home Screen. App Store build comes later.
          </p>
        </div>

        <p className="text-center text-sm">
          <Link href="/" className="text-emerald-700 font-medium hover:underline">
            Back to Kynthai
          </Link>
        </p>
      </div>
    </main>
  )
}
