import { useRef, useState } from "react"
import { Storage } from "@plasmohq/storage"
import { Check, Shield, ScrollText } from "lucide-react"

import { TERMS_AND_CONDITIONS } from "~lib/termsContent"

import "~style.css"

const storage = new Storage({
    area: "local"
})

export default function OnboardingPage() {
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
    const [accepted, setAccepted] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
            // Check if user is near the bottom (within 20px)
            if (scrollTop + clientHeight >= scrollHeight - 20) {
                setHasScrolledToBottom(true)
            }
        }
    }

    const handleAccept = async () => {
        await storage.set("termsAccepted", true)
        await storage.set("installDate", new Date().toISOString())
        setAccepted(true)

        // Redirect to dashboard
        setTimeout(() => {
            chrome.tabs.update({ url: chrome.runtime.getURL("tabs/dashboard.html") })
        }, 1500)
    }

    if (accepted) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 animate-fade-in-up">
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                    <Check className="w-10 h-10 text-emerald-400" />
                </div>
                <h1 className="text-4xl font-bold mb-4 text-center">Setup Complete!</h1>
                <p className="text-slate-400 text-lg text-center max-w-md">
                    You have successfully accepted the Terms of Service.
                    <br />
                    <span className="text-emerald-400 font-bold animate-pulse">Redirecting to Dashboard...</span>
                </p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans flex items-center justify-center p-6 md:p-12">
            <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-8 border-b border-slate-800 bg-slate-900 z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <Shield className="w-6 h-6 text-emerald-400" />
                        </div>
                        <h1 className="text-2xl font-bold">Terms of Service</h1>
                    </div>
                    <p className="text-slate-400 text-sm">
                        Please read the terms carefully. You must scroll to the end to continue.
                    </p>
                </div>

                {/* Scrollable Content */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-950/50 scroll-smooth custom-scrollbar"
                >
                    {TERMS_AND_CONDITIONS.split('\n').map((line, index) => {
                        if (line.startsWith('## ')) {
                            return <h2 key={index} className="text-xl font-bold text-white mt-6 mb-3">{line.replace('## ', '')}</h2>
                        }
                        if (line.startsWith('# ')) {
                            return <h1 key={index} className="text-3xl font-black text-white mb-6">{line.replace('# ', '')}</h1>
                        }
                        if (line.startsWith('**') && line.endsWith('**')) {
                            return <p key={index} className="font-bold text-emerald-400">{line.replace(/\*\*/g, '')}</p>
                        }
                        if (line.startsWith('- ')) {
                            return <li key={index} className="ml-4 list-disc text-slate-300">{line.replace('- ', '')}</li>
                        }
                        if (line === '---') {
                            return <hr key={index} className="border-slate-800 my-6" />
                        }
                        return (
                            <p key={index} className={`text-slate-300 leading-relaxed ${line.trim() === '' ? 'h-4' : ''}`}>
                                {line}
                            </p>
                        )
                    })}

                    {/* Spacer at bottom to ensure easy scrolling to end */}
                    <div className="h-10"></div>
                </div>

                {/* Footer actions */}
                <div className="p-8 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <ScrollText className="w-4 h-4" />
                        <span>
                            {hasScrolledToBottom
                                ? "Read compeleted"
                                : "Scroll to the bottom to accept"}
                        </span>
                    </div>

                    <button
                        onClick={handleAccept}
                        disabled={!hasScrolledToBottom}
                        className={`
                px-8 py-3 rounded-xl font-bold text-lg transition-all flex items-center gap-2
                ${hasScrolledToBottom
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 cursor-pointer transform hover:-translate-y-0.5'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}
            `}
                    >
                        <span>I Accept & Install</span>
                        <Check className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
