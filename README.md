# Surgero — B2B Pricing & Proposal Application

A portfolio-safe version of a frontend application for building and managing treatment quotations, pricing rules, add-on services and PDF proposals.

> **Portfolio note:** Production credentials, private customer data, storage tokens, proprietary PDF templates and real commercial pricing have been removed or replaced with demo values.

## Highlights

- React + TypeScript application built with Vite
- Firebase Authentication and Firestore integration
- Role-based access for Admin, Team and Doctor users
- Dynamic treatment pricing, doctor multipliers and discounts
- Add-on service and hospital management
- Quote history and audit-oriented workflows
- PDF proposal generation
- Responsive dashboard and management interfaces

## Tech Stack

- React 19
- TypeScript
- Vite
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- React Router
- pdf-lib / jsPDF
- HTML / CSS

## Project Structure

```text
components/     Reusable interface components
context/        Application state and auth context
pages/          Calculator, admin, doctors, treatments and quote history
services/       Firebase-backed domain services
store/          Demo seed data and local storage helpers
types/          Shared TypeScript entities
utils/          Pricing, helpers and PDF generation
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file:

```bash
cp .env.example .env.local
```

3. Add credentials for **your own Firebase project** to `.env.local`.

4. Start the development server:

```bash
npm run dev
```

## Firebase Data Model

The application expects collections for users, doctors, treatments, add-ons, hospitals, quotes and audit-related records. This repository does not include any production database export.

## Privacy & Security

This public portfolio version intentionally excludes:

- Production Firebase configuration
- API keys and access tokens
- Real customer or patient records
- Private staff credentials
- Proprietary PDF proposal templates
- Real commercial pricing data

Only sanitized demo data is included.

## Portfolio Context

This project demonstrates work across frontend application architecture, TypeScript, Firebase integration, role-based interfaces, business-rule implementation and document-generation workflows.

---

**Author:** Furkan Turan  
**Focus:** Frontend Development · React · TypeScript · Firebase
