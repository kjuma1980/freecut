import { useState, useCallback, useRef, useEffect, memo } from 'react'
import {
  Play,
  Square,
  Plus,
  Search,
  Loader2,
  Check,
  FolderOpen,
  Copy,
  Info,
  FileAudio,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SFX_CATEGORIES, SFX_ITEMS, SFX_ASSETS_DIR, type SfxItem } from './sfx-catalog'
import { playSfxPreview, synthesizeSfx, encodeAudioBufferToWav } from './sfx-synthesizer'
import {
  importMediaLibraryService,
  setMediaDragData,
  clearMediaDragData,
} from '@/features/editor/deps/media-library'
import {
  useTimelineStore,
  useItemsStore,
  useTimelineSettingsStore,
} from '@/features/editor/deps/timeline-store'
import { useProjectStore } from '@/features/editor/deps/projects'
import { usePlaybackStore } from '@/shared/state/playback'
import { toast } from 'sonner'
import type { AudioItem } from '@/types/timeline'

export const SfxLibraryPanel = memo(function SfxLibraryPanel() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [playingSfxId, setPlayingSfxId] = useState<string | null>(null)
  const [insertingSfxId, setInsertingSfxId] = useState<string | null>(null)
  const [insertedSuccessId, setInsertedSuccessId] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState(false)
  const activeSoundStopRef = useRef<(() => void) | null>(null)

  // Clean up sound on unmount
  useEffect(() => {
    return () => {
      if (activeSoundStopRef.current) {
        activeSoundStopRef.current()
        activeSoundStopRef.current = null
      }
    }
  }, [])

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(SFX_ASSETS_DIR)
    setCopiedPath(true)
    toast.success('Ruta copiada al portapapeles: ' + SFX_ASSETS_DIR)
    setTimeout(() => setCopiedPath(false), 2000)
  }, [])

  // Filter items if any exist
  const filteredItems = SFX_ITEMS.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Play / Stop preview
  const handleTogglePreview = useCallback(
    async (sfx: SfxItem) => {
      if (activeSoundStopRef.current) {
        activeSoundStopRef.current()
        activeSoundStopRef.current = null
      }

      if (playingSfxId === sfx.id) {
        setPlayingSfxId(null)
        return
      }

      try {
        setPlayingSfxId(sfx.id)
        let hasFile = false
        try {
          const res = await fetch(sfx.assetPath, { method: 'HEAD' })
          if (res.ok) hasFile = true
        } catch {
          hasFile = false
        }

        if (hasFile) {
          const audio = new Audio(sfx.assetPath)
          audio.onended = () => setPlayingSfxId(null)
          activeSoundStopRef.current = () => audio.pause()
          await audio.play()
        } else {
          const player = await playSfxPreview(sfx.id, () => {
            setPlayingSfxId(null)
            activeSoundStopRef.current = null
          })
          activeSoundStopRef.current = player.stop
        }
      } catch {
        setPlayingSfxId(null)
      }
    },
    [playingSfxId],
  )

  // Insert SFX into project & timeline
  const handleInsertSfx = useCallback(async (sfx: SfxItem) => {
    try {
      setInsertingSfxId(sfx.id)

      let blob: Blob | null = null
      try {
        const res = await fetch(sfx.assetPath)
        if (res.ok) {
          blob = await res.blob()
        }
      } catch {
        blob = null
      }

      if (!blob) {
        const audioBuffer = await synthesizeSfx(sfx.id)
        blob = encodeAudioBufferToWav(audioBuffer)
      }

      const file = new File([blob], `${sfx.id}.wav`, { type: 'audio/wav' })
      const { mediaLibraryService } = await importMediaLibraryService()
      const currentProjectId = useProjectStore.getState().currentProject?.id || 'default'
      const imported = await mediaLibraryService.importGeneratedAudio(file, currentProjectId, {
        tags: ['sfx', sfx.category],
      })

      if (!imported) {
        toast.error('No se pudo importar el efecto de sonido al proyecto')
        return
      }

      const store = useItemsStore.getState()
      const tracks = store.tracks
      let targetTrack = tracks.find((t) => !t.isGroup && t.kind === 'audio')
      if (!targetTrack) {
        const maxOrder = tracks.reduce((max, t) => Math.max(max, t.order ?? 0), -1)
        targetTrack = {
          id: `track-${crypto.randomUUID()}`,
          name: 'A1',
          kind: 'audio',
          height: 48,
          locked: false,
          syncLock: true,
          visible: true,
          muted: false,
          solo: false,
          volume: 0,
          order: maxOrder + 1,
          items: [],
        }
        store.setTracks([...tracks, targetTrack])
      }

      const fps = useTimelineSettingsStore.getState().fps
      const playheadFrame = usePlaybackStore.getState().currentFrame
      const durationInFrames = Math.max(1, Math.round(sfx.duration * fps))

      const audioItem: AudioItem = {
        id: crypto.randomUUID(),
        type: 'audio',
        trackId: targetTrack.id,
        from: playheadFrame,
        durationInFrames,
        src: URL.createObjectURL(blob),
        mediaId: imported.id,
        label: sfx.name,
        volume: 0,
        speed: 1,
      }

      useTimelineStore.getState().addItem(audioItem)
      setInsertedSuccessId(sfx.id)
      setTimeout(() => setInsertedSuccessId(null), 1800)
      toast.success(`Efecto "${sfx.name}" añadido en el cabezal`)
    } catch (err) {
      toast.error(`Error al insertar: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInsertingSfxId(null)
    }
  }, [])

  // Drag & drop support
  const handleDragStart = useCallback(
    (sfx: SfxItem) => (event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = 'copy'
      const dragPayload = {
        type: 'media-item' as const,
        mediaId: `sfx-${sfx.id}`,
        mediaType: 'audio',
        fileName: `${sfx.name}.wav`,
        duration: sfx.duration,
      }
      event.dataTransfer.setData('application/json', JSON.stringify(dragPayload))
      setMediaDragData(dragPayload)
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    clearMediaDragData()
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* SFX Assets Directory Header / Banner */}
      <div className="p-3 border-b border-border/80 bg-secondary/15 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <FolderOpen className="w-3.5 h-3.5 text-primary" />
            <span>Carpeta de Archivos SFX</span>
          </div>
          <button
            type="button"
            onClick={handleCopyPath}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors"
            title="Copiar ruta al portapapeles"
          >
            {copiedPath ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copiar ruta</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-mono text-muted-foreground select-all break-all">
          <code className="text-foreground">{SFX_ASSETS_DIR}</code>
        </div>
      </div>

      {/* Content Body: If empty show clear instructions, if items exist show list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {SFX_ITEMS.length === 0 ? (
          <div className="space-y-4">
            {/* Guide Card */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                  <FileAudio className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Cómo agregar tus efectos de sonido
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Sigue estos pasos para subir tus archivos de audio y que aparezcan listados en
                    este panel:
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1 text-xs">
                {/* Step 1 */}
                <div className="flex items-start gap-2 rounded-lg bg-secondary/30 p-2.5 border border-border/40">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                    1
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-[11px]">
                      Colocar los archivos de sonido
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                      Copia tus archivos <code className="text-foreground">.wav</code> o{' '}
                      <code className="text-foreground">.mp3</code> en la carpeta:
                    </p>
                    <div className="mt-1 rounded bg-background/90 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border/50">
                      {SFX_ASSETS_DIR}
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-2 rounded-lg bg-secondary/30 p-2.5 border border-border/40">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                    2
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-[11px]">
                      Registrarlos en el catálogo
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                      Abre el archivo{' '}
                      <code className="text-foreground">
                        src/features/editor/components/audio-tab/sfx-catalog.ts
                      </code>{' '}
                      y agrega la entrada con su nombre, categoría y ruta:
                    </p>
                    <pre className="mt-1 rounded bg-background/90 p-2 font-mono text-[9.5px] text-muted-foreground border border-border/50 overflow-x-auto whitespace-pre leading-relaxed">
                      {`export const SFX_ITEMS: SfxItem[] = [
  {
    id: 'mi-sonido',
    name: 'Nombre del Sonido',
    category: 'transitions', // 'transitions' | 'ui' | 'foley'
    duration: 1.0,
    description: 'Descripción breve',
    assetPath: '/assets/audio/sfx/mi-sonido.wav',
  },
]`}
                    </pre>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-2 rounded-lg bg-secondary/30 p-2.5 border border-border/40">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                    3
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-[11px]">
                      Listo para usar en la línea de tiempo
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                      Al guardar los cambios, la aplicación recargará automáticamente y mostrará tus
                      sonidos con reproducción inmediata y botón de inserción al cabezal del video.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Information Tip */}
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
              <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                También puedes usar la pestaña <strong>Audio del Proyecto</strong> para extraer el
                audio de cualquier video importado o arrastrar pistas directamente al panel de
                medios.
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Search & Category Pills if items exist */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar efectos de sonido..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-secondary/30"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                {SFX_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sound Cards List */}
            <div className="space-y-2">
              {filteredItems.map((sfx) => {
                const isPlaying = playingSfxId === sfx.id
                const isInserting = insertingSfxId === sfx.id
                const isSuccess = insertedSuccessId === sfx.id

                return (
                  <div
                    key={sfx.id}
                    draggable={true}
                    onDragStart={handleDragStart(sfx)}
                    onDragEnd={handleDragEnd}
                    className="group relative flex items-center justify-between p-2 rounded-lg border border-border/60 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePreview(sfx)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                          isPlaying
                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30 scale-105'
                            : 'bg-secondary text-muted-foreground group-hover:text-foreground hover:bg-primary/20 hover:text-primary'
                        }`}
                        title={isPlaying ? 'Pausar' : 'Escuchar vista previa'}
                      >
                        {isPlaying ? (
                          <Square className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {sfx.name}
                          </span>
                          <span className="shrink-0 rounded bg-secondary/80 px-1 py-0.2 text-[9px] text-muted-foreground font-mono">
                            {sfx.duration}s
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate leading-tight">
                          {sfx.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isInserting}
                        onClick={() => handleInsertSfx(sfx)}
                        className={`h-7 px-2 text-[11px] gap-1 transition-all ${
                          isSuccess
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                            : 'hover:bg-primary/20 hover:text-primary'
                        }`}
                        title="Insertar en cabezal de la línea de tiempo"
                      >
                        {isInserting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isSuccess ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Añadido</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Insertar</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
})
