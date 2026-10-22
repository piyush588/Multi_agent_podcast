"""Topic Blueprint & Debate Agenda Engine.
Prevents the repetitive parrot loop by maintaining debate dimensions and established claims.
"""
from typing import List, Dict, Any, Optional

DEFAULT_TOPIC = "The Future of Open-Source AI: Acceleration vs Responsible Governance"

# Pre-computed thematic blueprints for instant, high-quality debate depth on popular topics
THEMATIC_BLUEPRINTS = {
    "open-source ai": {
        "title": "The Future of Open-Source AI: Acceleration vs Responsible Governance",
        "category": "Artificial Intelligence",
        "battlegrounds": [
            {
                "dimension": "Democratization vs Monopolistic Moats",
                "charlie_angle": "Closed APIs create dangerous Big Tech monopolies. Open weights empower millions of researchers and guarantee software freedom.",
                "roger_angle": "Unlike traditional code, frontier AI weights contain dual-use hazards that can be fine-tuned into automated cyber-weapons with zero audit trail.",
                "sarah_hook": "Can open innovation truly be safe if anyone with consumer GPUs can strip safety alignment in 10 lines of code?"
            },
            {
                "dimension": "Catastrophic Misuse vs Distributed Defense",
                "charlie_angle": "You don't secure the internet by outlawing encryption, and you don't secure AI by hiding models. Millions of good hackers find and patch zero-days first.",
                "roger_angle": "That analogy collapses when dealing with irreversible harms—like biological pathogen synthesis or critical infrastructure sabotage—where a single breach is fatal.",
                "sarah_hook": "Roger claims harm is irreversible; Charlie claims open defense is the only scalable shield. How do we test that without a catastrophic accident?"
            },
            {
                "dimension": "Economic Acceleration vs Labor Disruption",
                "charlie_angle": "Open models allow every small business and indie developer to compete globally without paying millions in API rent to Big Tech.",
                "roger_angle": "Unchecked acceleration without worker protections or retraining protocols concentrates wealth while displacing cognitive labor at an unabsorbable speed.",
                "sarah_hook": "Is economic disruption a natural feature of technological progress, or are we sleepwalking into unprecedented economic inequality?"
            }
        ]
    },
    "public transit": {
        "title": "Urban Infrastructure: High-Capacity Public Transit vs Autonomous Fleets",
        "category": "Urban Planning & Transit",
        "battlegrounds": [
            {
                "dimension": "Municipal Rail vs Autonomous EV Fleets",
                "charlie_angle": "Fixed-rail transit is a 20th-century capital trap costing billions with rigid routes. Dynamic autonomous robotaxis and micro-vans are infinitely more flexible.",
                "roger_angle": "Geometry doesn't lie: private robotaxis will clog city streets with empty deadheading miles. High-capacity grade-separated rail is the only way to move 50,000 people per hour.",
                "sarah_hook": "Charlie says trains are obsolete fiscal sinks, Roger says cars can never beat geometric density. Who is right when a city grows to 10 million people?"
            },
            {
                "dimension": "Equity & Access vs Tech-Enabled Elitism",
                "charlie_angle": "Private-public autonomous partnerships can offer door-to-door transit for low-income food deserts that buses haven't served in 40 years.",
                "roger_angle": "Private mobility companies always abandon unprofitable, marginalized neighborhoods the moment venture subsidies run dry, leaving vulnerable citizens stranded.",
                "sarah_hook": "Can a private tech platform ever be trusted to guarantee transportation as a fundamental public right?"
            },
            {
                "dimension": "Fiscal Solvency vs Municipal Debt",
                "charlie_angle": "Municipal transit agencies are drowning in pension liabilities and operational deficits. Competitive private contracting drives efficiency.",
                "roger_angle": "Public infrastructure is not supposed to be a profit center—it's a public good like clean water or schools that generates hundreds of billions in indirect economic activity.",
                "sarah_hook": "If public transit is a public utility, how much taxpayer subsidy is acceptable before it becomes fiscal negligence?"
            }
        ]
    },
    "universal basic income": {
        "title": "The Post-Labor Economy: Universal Basic Income vs Automation Dividend",
        "category": "Economics & AGI",
        "battlegrounds": [
            {
                "dimension": "Unconditional Cash vs Human Dignity and Purpose",
                "charlie_angle": "AGI will drive the marginal cost of intelligence and energy to near zero. A sovereign compute dividend distributed to every human unlocks radical creative freedom.",
                "roger_angle": "Detaching income from labor creates a permanent dependent underclass ruled by algorithmic oligarchs. Purpose, community, and democratic agency require meaningful work.",
                "sarah_hook": "Does a guaranteed universal payout liberate human potential, or does it institutionalize a docile underclass dependent on tech monopolies?"
            },
            {
                "dimension": "Fiscal Inflation vs Deflationary Abundance",
                "charlie_angle": "AI robotics creates massive deflation across manufacturing, medicine, and food. Printing cash or distributing compute shares will not cause inflation when supply explodes.",
                "roger_angle": "Scarce positional goods—land, energy grids, and housing—will hyper-inflate. Giving everyone flat cash without addressing asset inequality solves nothing.",
                "sarah_hook": "Can technological abundance outpace real-world scarcity in housing and physical infrastructure?"
            }
        ]
    },
    "brain-computer interfaces": {
        "title": "Neural Augmentation: Brain-Computer Interfaces vs Cognitive Privacy",
        "category": "Neurotech & Biotech",
        "battlegrounds": [
            {
                "dimension": "Cognitive Bandwidth vs Neural Surveillance",
                "charlie_angle": "Typing on screens is a pathetic 100-baud bottleneck. High-density BCIs allow direct cortical bandwidth to AI copilots, curing neurological diseases and leveling human capability.",
                "roger_angle": "The moment private companies decode your sub-vocalized thoughts and emotional states, cognitive liberty ceases to exist. Your brain becomes the ultimate advertising target.",
                "sarah_hook": "When our innermost thoughts can be decoded by private algorithms, where does personal autonomy begin and corporate telemetry end?"
            },
            {
                "dimension": "Augmentation Arms Race vs Species Stratification",
                "charlie_angle": "Without biological enhancement, biological humans will inevitably be left behind by synthetic superintelligence. BCI is our only symbiotic survival strategy.",
                "roger_angle": "If neural implants cost $50,000, we create a literal biological caste system where the wealthy think ten times faster than everyone else, shattering the social contract.",
                "sarah_hook": "Will neural implants elevate all of humanity or create an irreconcilable genetic and intellectual caste divide?"
            }
        ]
    },
    "nuclear fusion": {
        "title": "Powering Planetary AGI: Nuclear Fusion vs Massive Renewable Super-Grids",
        "category": "Energy & Climate",
        "battlegrounds": [
            {
                "dimension": "High-Density Baseload vs Decentralized Distributed Solar",
                "charlie_angle": "AI data centers require gigawatts of constant baseload power that intermittent solar and batteries cannot deliver. Magnetically confined fusion is the only compact answer.",
                "roger_angle": "Fusion has been '30 years away' for 50 years. Wind, solar, and sodium-ion batteries are deployed right now, rapidly plummeting in price with zero radioactive tritium risks.",
                "sarah_hook": "Should we pour hundreds of billions into next-gen fusion or double down immediately on proven renewable grids?"
            },
            {
                "dimension": "Centralized Power Cartels vs Community Grid Resilience",
                "charlie_angle": "Ultra-dense fusion reactors can sit directly next to compute clusters with zero transmission line losses and zero carbon emissions.",
                "roger_angle": "Gigawatt fusion plants re-centralize power in the hands of state and utility monopolies, whereas distributed rooftop solar and micro-grids democratize energy ownership.",
                "sarah_hook": "Does our energy future belong to concentrated mega-reactors or decentralized community microgrids?"
            }
        ]
    },
    "information warfare": {
        "title": "Information Warfare: Deepfake Verification Defense vs Digital Free Speech",
        "category": "Media & Society",
        "battlegrounds": [
            {
                "dimension": "Cryptographic Provenance vs Centralized Censorship",
                "charlie_angle": "Cryptographic provenance standards like C2PA and local signatures let citizens verify source media without giving governments a centralized censorship kill-switch.",
                "roger_angle": "Watermarks and metadata are stripped by state actors in seconds. Without strict platform liability and automated friction on synthetic virality, democratic elections will dissolve in tailored propaganda.",
                "sarah_hook": "If metadata can be stripped in seconds, and platform filtering turns into political censorship, how can public trust survive?"
            },
            {
                "dimension": "Synthetic Voice/Video Clones vs Democratic Cohesion",
                "charlie_angle": "Banning generative tools is impossible. The defense is open-source adversarial detectors and distributed verification networks running on consumer hardware.",
                "roger_angle": "Adversarial detectors are always one step behind the generative frontier. By the time a deepfake is debunked, the reputational damage and real-world panic are already done.",
                "sarah_hook": "When synthetic reality is indistinguishable from live cameras, does public debate simply degenerate into tribal disbelief?"
            }
        ]
    },
    "windows vs macos": {
        "title": "Windows vs. macOS: Which Is Truly Better?",
        "category": "Consumer Tech & Operating Systems",
        "battlegrounds": [
            {
                "dimension": "Hardware Freedom & Gaming Supremacy vs Silicon Optimization",
                "charlie_angle": "Windows gives you total hardware autonomy: custom rigs, swappable GPUs, unbeatable gaming compatibility, and price-to-performance without paying the 300% Apple RAM and SSD upgrade tax.",
                "roger_angle": "macOS with Apple Silicon delivers unmatched battery life, unified memory bandwidth, zero thermal throttling, and hardware-software optimization that Windows laptops simply cannot match.",
                "sarah_hook": "Is hardware customizability and gaming worth Windows driver quirks and battery drain, or does Apple's integrated silicon actually deliver a superior daily machine?"
            },
            {
                "dimension": "Open Computing Autonomy vs Walled Garden Security",
                "charlie_angle": "On Windows, you actually own your computer. You can sideload any executable, run legacy software, and tweak registry settings without Apple's Gatekeeper treating you like a child.",
                "roger_angle": "Windows is a legacy mess crammed with telemetry, forced Cortana/Copilot bloatware, and constant security vulnerabilities. macOS gives ordinary users a secure UNIX foundation that just works out of the box.",
                "sarah_hook": "Do users want raw computing freedom with security risks, or a pristine walled garden where Apple dictates what software you can run?"
            },
            {
                "dimension": "Real-World Workflow, Developer Speed & Ecosystem Polish",
                "charlie_angle": "With WSL2, Windows lets you run a full native Linux kernel alongside gaming and enterprise tools. It is the most versatile workstation setup on earth.",
                "roger_angle": "macOS is POSIX-compliant UNIX by default, with Core Audio, seamless AirDrop, and a distraction-free creative interface that doesn't randomly reboot for updates in the middle of a presentation.",
                "sarah_hook": "When deadlines are on the line, which operating system actually gets out of your way and lets you finish your work?"
            }
        ]
    }
}

class TopicEngine:
    def __init__(self, topic: str = DEFAULT_TOPIC):
        self.topic = topic
        self.battlegrounds = self._initialize_battlegrounds(topic)
        self.current_battleground_idx = 0
        self.established_claims: List[str] = []

    def _initialize_battlegrounds(self, topic: str) -> List[Dict[str, str]]:
        lower = topic.lower()
        # Direct check for windows / macos
        if any(w in lower for w in ["windows", "macos", "mac vs", "windows vs", "operating system"]):
            return THEMATIC_BLUEPRINTS["windows vs macos"]["battlegrounds"]

        # 1. Match full key or full blueprint title
        for key, blueprint in THEMATIC_BLUEPRINTS.items():
            b_title = blueprint.get("title", "").lower()
            if key in lower or lower in b_title or b_title in lower:
                return blueprint["battlegrounds"]
        # 2. Match significant keyword stems
        for key, blueprint in THEMATIC_BLUEPRINTS.items():
            words = [w for w in key.split() if len(w) > 3]
            if any(w in lower for w in words):
                return blueprint["battlegrounds"]
        # Generic dynamic battlegrounds for arbitrary user topics (strictly anchored to topic, no AI regulatory jargon)
        return [
            {
                "dimension": "Core Value & Practical Utility",
                "charlie_angle": f"Focus on real-world performance, user freedom, and practical everyday advantages of {topic}.",
                "roger_angle": f"Expose the hidden costs, reliability compromises, and real trade-offs behind {topic}.",
                "sarah_hook": f"What is the single biggest real-world advantage or fatal flaw when it comes to {topic}?"
            },
            {
                "dimension": "User Autonomy vs Polish & Stability",
                "charlie_angle": f"Users should have total flexibility, customization, and control without artificial limits on {topic}.",
                "roger_angle": f"Without curated standards, consistency, and stability, {topic} becomes frustrating and unreliable for everyday people.",
                "sarah_hook": f"Where is the balance between total flexibility and polished reliability on {topic}?"
            },
            {
                "dimension": "Long-Term Value & Real-World Economics",
                "charlie_angle": f"The long-term flexibility, adaptability, and ecosystem value of {topic} make it the superior choice.",
                "roger_angle": f"Look at the hidden expenses, support headaches, and actual total cost of ownership on {topic}.",
                "sarah_hook": f"When you look at actual value for money and time spent, which side really wins on {topic}?"
            }
        ]

    def get_current_battleground(self) -> Dict[str, str]:
        if not self.battlegrounds:
            return {
                "dimension": "Core Debate",
                "charlie_angle": "Push the frontier of innovation.",
                "roger_angle": "Protect public safety and accountability.",
                "sarah_hook": "Where do we find the balance?"
            }
        idx = self.current_battleground_idx % len(self.battlegrounds)
        return self.battlegrounds[idx]

    def advance_battleground(self) -> None:
        self.current_battleground_idx = (self.current_battleground_idx + 1) % max(1, len(self.battlegrounds))

    def record_claim(self, claim: str) -> None:
        if claim and claim not in self.established_claims:
            self.established_claims.append(claim)
            # When multiple claims are recorded on a battleground, advance to the next dimension!
            if len(self.established_claims) % 2 == 0:
                self.advance_battleground()

    def get_novelty_directives(self) -> str:
        """Returns strict negative constraints on what NOT to repeat."""
        if not self.established_claims:
            return ""
        recent = self.established_claims[-4:]
        claims_formatted = "\n".join([f"- Do NOT repeat: '{c}'" for c in recent])
        return f"\nPOINTS ALREADY ARGUED IN THIS EPISODE (DO NOT RESTATE OR RE-PARAPHRASE):\n{claims_formatted}\nIntroduce a FRESH dimension or concrete new example!"
