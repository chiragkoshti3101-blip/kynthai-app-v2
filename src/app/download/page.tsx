import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Download, Bell, Shield } from 'lucide-react'
import { KynthaiBrand } from '@/components/kynthai/logo'

export const metadata: Metadata = {
  title: 'Download Kynthai for Android',
  description:
    'Official Android APK — reliable medication reminders and notifications when the app is closed.',
}

const APK = '/downloads/kynthai-android.apk'

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[#f9fdfb] text-slate-900">
      <div className="mx-auto max-w-lg px-5 py-10 space-y-8">
        <div className="flex justify-center">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="Kynthai home">
            <KynthaiBrand iconSize={32} />
          </Link>
        </div>

        <div className="space-y-4 text-center">
          <div className="mx-auto relative h-24 w-24 overflow-hidden rounded-[1.35rem] shadow-lg ring-1 ring-emerald-900/10">
            <Image
              src="/icon-512.png"
              alt="Kynthai app icon"
              width={96}
              height={96}
              priority
              className="h-full w-full object-cover"
            />
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
          <ol className="list-decimal list-inside space-y-1">
            <li>Tap Download Android APK</li>
            <li>Open the downloaded file</li>
            <li>Tap Install (allow “Install unknown apps” for Chrome/Files if asked)</li>
            <li>Open Kynthai — Android will ask <strong>Allow notifications?</strong> → tap <strong>Allow</strong></li>
            <li>If no dialog appears: Settings → Apps → Kynthai → Notifications → turn On</li>
            <li>Sign in with your account</li>
          </ol>
        </div>

        <p className="text-center text-xs text-slate-500 leading-relaxed">
          iPhone: use Safari → Share → Add to Home Screen. App Store build comes later.
        </p>

        <div className="text-center">
          <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline">
            Back to Kynthai
          </Link>
        </div>
      </div>
    </main>
  )
}
