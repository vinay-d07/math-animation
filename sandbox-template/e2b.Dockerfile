# E2B sandbox template — the actual execution boundary for AI-generated
# Manim scene code. Each render spins up a fresh sandbox built from this
# image, validates and runs one scene in it, and the sandbox is destroyed
# afterward (see apps/api/src/lib/sandboxRenderer.ts). It never talks to the
# network (allowInternetAccess: false) and never shares filesystem/state
# with our own infrastructure or with other renders.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    texlive \
    texlive-latex-extra \
    texlive-fonts-extra \
    texlive-latex-recommended \
    texlive-science \
    texlive-extra-utils \
    tipa \
    dvisvgm \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "manim>=0.18.0,<0.20" numpy

COPY validator.py /opt/validator.py
