import Image from "next/image"
import { asset, cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-7 shrink-0 overflow-hidden rounded-lg ring-1 ring-border", className)}>
      <Image src={asset("/logo.jpg")} alt="" fill sizes="64px" className="object-cover" unoptimized priority />
    </span>
  )
}

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      {showName && <span className="font-display text-[17px] font-semibold tracking-tight">SketchNeko</span>}
    </span>
  )
}
