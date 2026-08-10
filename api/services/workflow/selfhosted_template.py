"""Local workflow starter used when managed MPS template generation is unavailable.

Self-hosted installs often cannot reach ``MPS_API_URL`` (default
``services.dograh.com``, overridable via env). In that case, create a usable
Start → Agent → End workflow seeded from the user's use case and activity
description.
"""

from __future__ import annotations


def build_selfhosted_workflow_from_template(
    *,
    call_type: str,
    use_case: str,
    activity_description: str,
) -> dict:
    """Return ``{name, workflow_definition}`` matching the MPS create-workflow shape."""
    cleaned_use_case = (use_case or "").strip() or "Voice Agent"
    cleaned_activity = (activity_description or "").strip() or (
        "Help the caller with their request."
    )
    is_outbound = call_type.strip().upper() == "OUTBOUND"

    if is_outbound:
        greeting = f"Hi, this is an AI assistant calling about {cleaned_use_case}."
        start_prompt = (
            f"You are placing an outbound call about {cleaned_use_case}. "
            "Confirm you reached the right person, briefly explain why you are "
            "calling, then continue with the conversation goals."
        )
    else:
        greeting = f"Hi, thanks for calling. I'm here to help with {cleaned_use_case}."
        start_prompt = (
            f"You are answering an inbound call about {cleaned_use_case}. "
            "Greet the caller warmly and begin helping them with their request."
        )

    agent_prompt = (
        f"You are a helpful voice agent for: {cleaned_use_case}.\n\n"
        f"Your goals and activities:\n{cleaned_activity}\n\n"
        "Speak naturally and concisely over the phone. Ask one question at a "
        "time. When the conversation is complete, thank the caller and end politely."
    )

    workflow_definition = {
        "nodes": [
            {
                "id": "1",
                "type": "startCall",
                "position": {"x": 250, "y": 0},
                "data": {
                    "name": "Start Call",
                    "prompt": start_prompt,
                    "greeting_type": "text",
                    "greeting": greeting,
                    "allow_interrupt": True,
                    "is_start": True,
                },
            },
            {
                "id": "2",
                "type": "agentNode",
                "position": {"x": 250, "y": 220},
                "data": {
                    "name": "Agent",
                    "prompt": agent_prompt,
                    "allow_interrupt": True,
                },
            },
            {
                "id": "3",
                "type": "endCall",
                "position": {"x": 250, "y": 440},
                "data": {
                    "name": "End Call",
                    "prompt": (
                        "Thank the caller briefly, confirm any next steps if "
                        "relevant, and end the call politely."
                    ),
                    "is_end": True,
                },
            },
        ],
        "edges": [
            {
                "id": "1-2",
                "source": "1",
                "target": "2",
                "data": {
                    "label": "Continue",
                    "condition": "Greeting finished; continue the conversation",
                },
            },
            {
                "id": "2-3",
                "source": "2",
                "target": "3",
                "data": {
                    "label": "Done",
                    "condition": "The conversation goals are complete or the caller wants to end",
                },
            },
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    return {
        "name": cleaned_use_case[:120],
        "workflow_definition": workflow_definition,
    }
