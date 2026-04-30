# 1. Use a lightweight Python base image
FROM python:3.12-slim

# 2. Copy the pre-compiled uv binary from Astral's official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 3. Set the working directory
WORKDIR /app

# 4. Create a virtual environment and install dependencies using uv
# Using psycopg2-binary skips the need for system-level build tools like gcc
RUN uv venv /opt/venv && \
    uv pip install --python /opt/venv mcp psycopg2-binary

# 5. Ensure the virtual environment is used for all subsequent commands
ENV PATH="/opt/venv/bin:$PATH"

# 6. Copy your MCP server script into the container
# (Assuming your python file is named server.py)
COPY main.py .

# 7. Run the server
# Since MCP uses STDIO for transport, we just execute the script.
CMD ["python", "main.py"]