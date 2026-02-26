# STYLE_GUIDE.md — FreeWeight

## Purpose
Define the visual identity for your product so that every page, screen, and asset feels cohesive.  

This document is also an AI onboarding doc: when you hand it to a code agent alongside your `BRAND_POSITION.md`, the agent generates consistent, on-brand output.

---

# 1. Visual Tone

**Overall Feel:**  
Clean · Athletic · Sharp · Exciting

**What it is:**  
Smart · Strong · Intuitive  

**What it is NOT:**  
Overly decorated  
Messy

---

# 2. Color Palette

| Name        | Hex       | Role |
|------------|-----------|------|
| **Primary** | `#B4F000` | Primary accent — buttons, links, key actions |
| **Secondary** | `#5A6572` | Supporting accent — section highlights, hover states |
| **Accent** | `#E6EDF3` | Selective emphasis — badges, tags, small highlights |
| **Background** | `#14181C` | Page canvas and card backgrounds |
| **Text** | `#E6EDF3` | Body text and headings |
| **Error** | `#FF4D4F` | Error states, alerts, destructive actions |

### Color Rules
- Avoid pure black (`#000000`) for text; use a dark gray instead.
- Accent colors should not compete with Primary for attention.
- Ensure sufficient contrast between text and background.
- Aim for **WCAG AA (4.5:1 contrast ratio for body text).**

---

# 3. Typography

**Heading Font:** Victory Striker Sans  
**Body Font:** Roboto  

## Type Scale

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| **H1** | 2.25rem | Bold | Page title, hero headline |
| **H2** | 1.75rem | Bold | Section titles |
| **H3** | 1.375rem | Semibold | Subsection headers |
| **Body** | 1rem | Regular | Paragraph text |
| **Small** | 0.875rem | Regular | Captions, labels, helper text |

### Typography Rules
- Keep headings short and declarative.
- Body copy should be highly readable; favor short paragraphs.
- Use bold sparingly for structural emphasis, not decoration.

---

# 4. Component Patterns

## Buttons

| Type | Style | Usage |
|------|-------|-------|
| **Primary CTA** | Filled with `#B4F000`, text color `#14181C`, rounded corners | Main action: "Join Waitlist", "Get Early Access" |
| **Secondary** | Outlined with `#B4F000`, transparent background | Alternative actions |

---

## Cards (If Used)

- Background: white or light variant of background color  
- Border: subtle (1px light gray) or soft shadow  
- Border radius: 8px–12px  
- Padding: generous (minimum 16px)

---

## Form Inputs

- Border radius: 8px  
- Focus state: ring or border highlight in `#B4F000`  
- Placeholder text: muted gray  

---

# 5. Imagery & Icons

**Icon Style:**  
Minimalist · Relevant · Sharp · Clean · Vibrant

**Photography / Illustration Style:**  
Clean gym photos  
Action athletic shots  
Minimalist illustrations  

**Avoid:**  
Stock photos that feel staged  
Overly polished lifestyle imagery  

---

# Implementation Notes

**CSS Framework:** Tailwind CSS  
**Deployment:** Vercel  
**Responsive:** Mobile-first design; test at 375px width minimum  