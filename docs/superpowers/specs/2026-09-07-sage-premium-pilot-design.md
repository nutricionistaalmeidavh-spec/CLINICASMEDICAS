# Sage Premium Pilot Design

## Scope
Redesign only the Plennus visual pilot: Design System, persistent Shell, Dashboard and Pacientes. Preserve existing IDs, navigation contracts, event handlers, database access, Clinic Hub, professional isolation, backup/restore and odontology behavior.

## Visual direction
- Primary dark: `#35483C`
- Primary: `#526A5A`
- Accent: `#8FA88F`
- App background: `#F6F4EE`
- Cards: `#FFFFFF`
- Primary text: `#242824`
- Secondary text: `#667068`
- Borders: `#DDDCD4`
- Status colors remain semantic and must not reuse Sage for errors/warnings.

## Design system
Use `css/platform.css` as the premium token layer on top of legacy `css/style.css`. Extend semantic tokens for surfaces, typography, spacing, radius, shadow, focus and interactive states. Avoid page-specific hard-coded brand colors where a token exists.

## Shell
Keep the current sidebar and runtime topbar contracts. Restyle the sidebar in deep Sage, reduce visual weight, add a quieter active state, keep global search prominent and add a compact user/profile area to the topbar without changing authentication behavior.

## Dashboard
Make the day operational flow dominant. The first row must emphasize upcoming appointments and items requiring attention. KPIs become secondary. Existing IDs used by loaders must remain available, and role-based hiding of financial/admin cards must keep working.

## Pacientes
Keep the existing patient form IDs and CRUD functions. Convert the page into a premium split workspace: editor on the left and searchable patient list on the right. Add a runtime page header, patient count, local list filter, initials avatar and semantic allergy badge. Existing row click and PEP button behavior must remain intact.

## Responsiveness
At <= 1180px the dashboard focus layout and patients split view may collapse. At <= 860px both become a single column. No mobile-specific navigation redesign is included in this pilot.

## Testing
Add contract tests that verify Sage tokens, shell structure, dashboard hierarchy and patient UI hooks while retaining existing IDs. Run full syntax validation and automated test suite before PR/merge.