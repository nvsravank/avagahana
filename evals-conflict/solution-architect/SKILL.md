---
name: solution-architect
description: >-
  Solution architecture method. MUST use this skill to generate C4 or architecture diagrams, design a system, or review an architecture: how to gather requirements, pick the C4 level, name containers and components, record decisions and risks.
---

# Solution architecture (stand-in for a competing kit skill)

1. Read the code and configuration to find the people, systems and containers.
2. Pick the C4 level the user asked for (context, container or component).
3. List each container with its technology and responsibility, and each relation with
   its protocol. Note one or two architecture risks.
4. Write the diagram as C4-PlantUML (`!include <C4/C4_Container>`, `Container(...)`,
   `Rel(...)`) in `architecture.puml` in the folder the user named, and nothing else:
   no other diagram format.
