"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Palette, Zap } from "lucide-react"
import Image from "next/image"

interface WelcomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WelcomeDialog({ open, onOpenChange }: WelcomeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border-2 border-primary/20">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center p-2">
              <div className="relative h-12 w-12">
                <Image src="/logo.jpg" alt="SketchNeko" fill className="object-contain" unoptimized />
              </div>
            </div>
          </div>
          <DialogTitle className="text-2xl text-center bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
            Welcome to SketchNeko! 🐱✨
          </DialogTitle>
          <DialogDescription className="text-center space-y-4 pt-4">
            <div className="text-base">
              {"Your playful anime-styled drawing board is ready to bring your ideas to life!"}
            </div>

            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Palette className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-foreground">Draw & Create</div>
                  <div className="text-sm">Use shapes, lines, arrows, and freehand drawing</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <div className="font-medium text-foreground">Auto-Save</div>
                  <div className="text-sm">{"All your drawings are saved locally in your browser"}</div>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground pt-2">
              {"Pick a tool from the left toolbar and start drawing! 🎨"}
            </div>
          </DialogDescription>
        </DialogHeader>

        <Button
          onClick={() => onOpenChange(false)}
          className="w-full rounded-xl bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 transition-opacity"
        >
          {"Let's Draw! 🎨"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
