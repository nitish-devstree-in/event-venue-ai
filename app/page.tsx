"use client"

import * as React from "react"
import type { EventLayoutPlannerPlan } from "@/components/event-layout-planner"
import { EventLayoutPlanner } from "@/components/event-layout-planner"
import { Button } from "@/components/ui/button"

type LightingPreset = "warm" | "cool" | "neutral" | "mixed" | "custom"
type VenueType = "indoor" | "outdoor" | "semi-open" | "covered"
type AccessType = "open" | "ticketed" | "private"

export default function Home() {
  const [venueImageFile, setVenueImageFile] = React.useState<File | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [step, setStep] = React.useState<"layout" | "details">("layout")
  const [plan, setPlan] = React.useState<EventLayoutPlannerPlan | null>(null)
  const [submitSuccess, setSubmitSuccess] = React.useState(false)
  const [eventDetails, setEventDetails] = React.useState({
    venueName: "",
    venueType: "indoor" as VenueType,
    accessType: "private" as AccessType,
    lighting: "warm" as LightingPreset,
    lightingNotes: "",
    primaryColors: "",
    secondaryColors: "",
    guestCount: 150,
    additionalNotes: "",
  })

  const venueImageUrl = React.useMemo(
    () => (venueImageFile ? URL.createObjectURL(venueImageFile) : null),
    [venueImageFile],
  )

  React.useEffect(() => {
    if (!venueImageUrl) return
    return () => URL.revokeObjectURL(venueImageUrl)
  }, [venueImageUrl])

  const acceptFile = (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return
    setVenueImageFile(file)
    setStep("layout")
  }

  if (!venueImageFile) {
    return (
      <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Wedding Layout
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              Select your venue image
            </h1>
            <p className="mt-2 text-sm text-[#596153]">
              Upload a photo or floor plan of the venue. Once selected, the 2D
              setup planner will open.
            </p>
          </div>

          <div
            role="button"
            tabIndex={0}
            className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#cfc6b6] bg-white p-6 text-center shadow-sm outline-none transition hover:bg-[#fbfaf7] focus-visible:ring-2 focus-visible:ring-[#66835d]/20"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              acceptFile(event.dataTransfer.files?.[0])
            }}
          >
            <div className="text-sm font-semibold">Drag & drop an image</div>
            <div className="text-sm text-[#6f756a]">or click to browse</div>
            <div className="text-xs text-[#6f756a]">
              PNG, JPG, WEBP (recommended: clear top-down shot)
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose image
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
        </div>
      </main>
    )
  }

  const updateEventDetails = <K extends keyof typeof eventDetails>(
    key: K,
    value: (typeof eventDetails)[K],
  ) => {
    setEventDetails((current) => ({ ...current, [key]: value }))
  }

  const submitPlan = () => {
    if (!plan) return

    const payload = {
      submittedAt: new Date().toISOString(),
      venueImage: {
        fileName: venueImageFile.name,
        fileType: venueImageFile.type,
        fileSizeBytes: venueImageFile.size,
      },
      venue: plan.venue,
      objects: plan.objects,
      eventDetails: {
        ...eventDetails,
      },
    }
    // TODO: send `payload` to your API/AI endpoint.
    void payload

    setSubmitSuccess(true)
    window.setTimeout(() => setSubmitSuccess(false), 2500)
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
      <div className="mx-auto w-full max-w-[1540px] px-4 pt-4">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[#d8d1c3] bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Venue image selected
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              {venueImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={venueImageUrl}
                  alt="Selected venue"
                  className="h-16 w-28 shrink-0 rounded-md border border-[#d8d1c3] object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {venueImageFile.name}
                </div>
                <div className="text-xs text-[#6f756a]">
                  You can change the image anytime.
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Change image
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setVenueImageFile(null)}
            >
              Remove
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
      </div>

      {step === "layout" ? (
        <EventLayoutPlanner
          onPlanChange={setPlan}
          onContinue={() => setStep("details")}
        />
      ) : (
        <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
                  Step 3
                </p>
                <h1 className="mt-2 text-2xl font-semibold">
                  Event details & submit
                </h1>
                <p className="mt-2 text-sm text-[#596153]">
                  Add details like lighting, colors, and venue info.
                </p>
              </div>

              <Button type="button" variant="outline" onClick={() => setStep("layout")}>
                Back to layout
              </Button>
            </div>

            <div className="rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm">
              {submitSuccess ? (
                <div className="mb-3 rounded-lg border border-[#b7e0c2] bg-[#edf8f0] px-3 py-2 text-sm font-medium text-[#1f5a33]">
                  Event layout plan submitted successfully.
                </div>
              ) : null}

              {/* <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Venue name"
                  value={eventDetails.venueName}
                  onChange={(value) => updateEventDetails("venueName", value)}
                />
                <NumberField
                  label="Approx guest count"
                  value={eventDetails.guestCount}
                  min={1}
                  max={2000}
                  suffix="guests"
                  onChange={(value) => updateEventDetails("guestCount", value)}
                />
              </div> */}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Venue type"
                  value={eventDetails.venueType}
                  options={[
                    { value: "indoor", label: "Indoor" },
                    { value: "outdoor", label: "Outdoor" },
                    { value: "semi-open", label: "Semi-open" },
                    { value: "covered", label: "Covered" },
                  ]}
                  onChange={(value) =>
                    updateEventDetails("venueType", value as VenueType)
                  }
                />
                {/* <SelectField
                  label="Open / access"
                  value={eventDetails.accessType}
                  options={[
                    { value: "open", label: "Open (public)" },
                    { value: "ticketed", label: "Ticketed" },
                    { value: "private", label: "Private" },
                  ]}
                  onChange={(value) =>
                    updateEventDetails("accessType", value as AccessType)
                  }
                /> */}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* <SelectField
                  label="Lighting"
                  value={eventDetails.lighting}
                  options={[
                    { value: "warm", label: "Warm" },
                    { value: "neutral", label: "Neutral" },
                    { value: "cool", label: "Cool" },
                    { value: "mixed", label: "Mixed" },
                    { value: "custom", label: "Custom" },
                  ]}
                  onChange={(value) =>
                    updateEventDetails("lighting", value as LightingPreset)
                  }
                /> */}
                <TextAreaField
                  label="Lighting notes"
                  value={eventDetails.lightingNotes}
                  onChange={(value) => updateEventDetails("lightingNotes", value)}
                />
              </div>

              {/* <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Primary colors"
                  value={eventDetails.primaryColors}
                  onChange={(value) => updateEventDetails("primaryColors", value)}
                />
                <TextField
                  label="Secondary colors"
                  value={eventDetails.secondaryColors}
                  onChange={(value) =>
                    updateEventDetails("secondaryColors", value)
                  }
                />
              </div> */}

              <div className="mt-3">
                <TextAreaField
                  label="Additional notes"
                  value={eventDetails.additionalNotes}
                  onChange={(value) => updateEventDetails("additionalNotes", value)}
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[#6f756a]">
                  {plan
                    ? `Layout captured: ${plan.objects.length} objects, ${plan.venue.areaSqFt} sq ft.`
                    : "Layout not captured yet. Go back and click Continue again."}
                </div>
                <Button
                  type="button"
                  className="bg-[#315c4b] text-white hover:bg-[#25483b]"
                  onClick={submitPlan}
                  disabled={!plan}
                >
                  Submit
                </Button>
              </div>
            </div>
          </div>
        </main>
      )}
    </main>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-y rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 py-2 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
