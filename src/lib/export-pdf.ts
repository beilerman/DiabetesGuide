import { jsPDF } from 'jspdf'
import { computeScore, computeGrade } from './grade'
import type { TripPlan } from './types'

interface ParkNames {
  [parkId: string]: string
}

const MARGIN = 20
const PAGE_WIDTH = 210
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

export function exportTripPlanPdf(plan: TripPlan, parkNames: ParkNames, resortName: string) {
  const doc = new jsPDF()
  let y = MARGIN

  function checkPageBreak(needed: number) {
    if (y + needed > 280) {
      doc.addPage()
      y = MARGIN
    }
  }

  // ─── Header ────────────────────────────────────────────────────────────
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text(resortName, MARGIN, y)
  y += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`${plan.days.length}-day trip plan  |  Carb goal: ${plan.carbGoalPerMeal}g per meal`, MARGIN, y)
  y += 4

  // Divider
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y)
  y += 8
  doc.setTextColor(0, 0, 0)

  // ─── Day-by-day ────────────────────────────────────────────────────────
  for (let d = 0; d < plan.days.length; d++) {
    const day = plan.days[d]
    const parkName = day.parkId ? (parkNames[day.parkId] ?? 'Unknown Park') : 'No park assigned'

    checkPageBreak(20)

    // Day header
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Day ${d + 1}`, MARGIN, y)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(parkName, MARGIN + 25, y)
    doc.setTextColor(0, 0, 0)
    y += 7

    // Meal slots
    for (const meal of day.meals) {
      checkPageBreak(14)

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(meal.name, MARGIN + 4, y)

      const mealCarbs = meal.items.reduce((s, i) => s + i.carbs, 0)
      const mealCal = meal.items.reduce((s, i) => s + i.calories, 0)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      doc.text(`${mealCarbs}g carbs  |  ${mealCal} cal`, MARGIN + CONTENT_WIDTH, y, { align: 'right' })
      doc.setTextColor(0, 0, 0)
      y += 5

      if (meal.items.length === 0) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(160, 160, 160)
        doc.text('No items planned', MARGIN + 8, y)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        y += 5
      } else {
        for (const item of meal.items) {
          checkPageBreak(6)

          const grade = computeGrade(computeScore({
            calories: item.calories, carbs: item.carbs, fat: item.fat,
            protein: item.protein, sugar: item.sugar, fiber: item.fiber,
            sodium: item.sodium,
          }))

          // Grade badge
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          const gradeText = grade ?? '?'
          const badgeX = MARGIN + 8
          doc.setFillColor(...gradeColor(grade))
          doc.roundedRect(badgeX, y - 3.5, 8, 4.5, 1, 1, 'F')
          doc.setTextColor(255, 255, 255)
          doc.text(gradeText, badgeX + 4, y, { align: 'center' })
          doc.setTextColor(0, 0, 0)

          // Item name
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          const nameText = item.name.length > 40 ? item.name.slice(0, 40) + '...' : item.name
          doc.text(nameText, MARGIN + 19, y)

          // Restaurant
          if (item.restaurant) {
            doc.setFontSize(7)
            doc.setTextColor(140, 140, 140)
            const restText = item.restaurant.length > 25 ? item.restaurant.slice(0, 25) + '...' : item.restaurant
            doc.text(restText, MARGIN + 19, y + 3.5)
            doc.setTextColor(0, 0, 0)
          }

          // Carbs right-aligned
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.text(`${item.carbs}g`, MARGIN + CONTENT_WIDTH, y, { align: 'right' })
          doc.setFont('helvetica', 'normal')

          y += item.restaurant ? 8 : 5.5
        }
      }
      y += 2
    }

    // Day totals
    const dayCarbs = day.meals.reduce((s, m) => s + m.items.reduce((s2, i) => s2 + i.carbs, 0), 0)
    const dayCal = day.meals.reduce((s, m) => s + m.items.reduce((s2, i) => s2 + i.calories, 0), 0)
    const dayProtein = day.meals.reduce((s, m) => s + m.items.reduce((s2, i) => s2 + i.protein, 0), 0)
    const dayItems = day.meals.reduce((s, m) => s + m.items.length, 0)

    if (dayItems > 0) {
      checkPageBreak(8)
      doc.setDrawColor(220, 220, 220)
      doc.line(MARGIN + 4, y, MARGIN + CONTENT_WIDTH, y)
      y += 4
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`Day ${d + 1} Total:  ${dayCarbs}g carbs  |  ${dayCal} cal  |  ${dayProtein}g protein`, MARGIN + 4, y)
      y += 6
    }

    y += 4
  }

  // ─── Footer ────────────────────────────────────────────────────────────
  checkPageBreak(20)
  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y)
  y += 6

  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(140, 140, 140)
  doc.text(
    'This plan is for informational purposes only and is not medical advice. Nutrition values are estimates.',
    MARGIN, y
  )
  y += 3
  doc.text(
    'Always consult your healthcare provider before making changes to your diabetes management.',
    MARGIN, y
  )
  y += 3
  doc.text(`Generated by DiabetesGuide on ${new Date().toLocaleDateString()}`, MARGIN, y)

  doc.save(`${resortName.replace(/[^a-zA-Z0-9]/g, '-')}-trip-plan.pdf`)
}

function gradeColor(grade: string | null): [number, number, number] {
  switch (grade) {
    case 'A': return [22, 163, 74]
    case 'B': return [101, 163, 13]
    case 'C': return [202, 138, 4]
    case 'D': return [234, 88, 12]
    case 'F': return [220, 38, 38]
    default: return [120, 113, 108]
  }
}
