#!/bin/bash

# Install Pipecat from the copy shipped in this Elphie repo.

# Get the project root directory (parent of scripts)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ELPHIE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ELPHIE_DIR"

echo "Setting up pipecat from the Elphie repo..."

if [[ ! -f "$ELPHIE_DIR/pipecat/pyproject.toml" ]]; then
  echo "pipecat/pyproject.toml is missing. Re-clone Elphie; Pipecat is included in the repo."
  exit 1
fi

# Install other requirements first so the in-repo pipecat wins any version conflicts
echo "Installing elphie API requirements..."
pip install -r api/requirements.txt

# Install pipecat from submodule last so it overrides any pipecat-ai pulled in by dependencies
echo "Installing pipecat dependencies..."
pip install -e ./pipecat[cartesia,deepgram,openai,elevenlabs,groq,google,azure,sarvam,soundfile,silero,webrtc,speechmatics,openrouter,camb,mcp,inworld,smallest]

echo "Setup complete. Pipecat is installed from this Elphie checkout."
