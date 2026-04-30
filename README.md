> [!NOTE]
> Currently under build process. Coming Soon!

<div align="center">
  <img src="./Doc/Media/rihnoNew.svg" style="width:100px">
  <h1>RIHNO</h1>
  <h3>A.I. Based Intrusion Detection System</h3>
  
  _intiGrow Internship Project_
</div>

## Introduction
- Intrusion Detection System (IDS): An intrusion detection system is a agent or software
application that monitors a network or computing systems for malicious activity or policy vi-
olations. Any intrusion activity or violation is typically either reported to an administrator
or collected centrally using a security information and event management (SIEM) system. A
SIEM system combines outputs from multiple sources and uses alarm-filtering techniques to
distinguish malicious activity from false alarms. IDS types range in scope from single computers
to large networks. The most common classifications are network intrusion detection systems
(NIDS) and host-based intrusion detection systems (HIDS). A system that monitors important
operating system files is an example of an HIDS, while a system that analyzes incoming network
traffic is an example of an NIDS.
- AI-based IDS: An AI-based intrusion detection system leverages artificial intelligence tech-
nologies to monitor network traffic and identify unauthorized access or malicious activities.
These systems use machine learning to analyze data in real time, allowing them to detect novel
threats and adapt to emerging cyber risks more effectively than traditional rule-only methods.

## Scope

<p> The AI-Based Intrusion Detection System (RIHNO) is designed as a unified security monitor-
ing platform to protect modern hybrid digital infrastructures through real-time visibility and
intelligent threat detection. The system architecture, as illustrated in Figure 1, is composed of
the following major subsystems:
Agent Layer (Data Collection): Lightweight monitoring agents, built in Go and C++,
are deployed across diverse endpoints including cloud virtual machines, containers, local servers,
and IoT nodes such as Raspberry Pi and ESP32. A dedicated Go Producer CLI Tool (rihno)
is provided for on-site agent provisioning and lifecycle management. The CLI exposes the fol-
lowing commands: rihno config registers a new agent with the backend; rihno start begins
transmitting host and network logs to the remote server; rihno start --local additionally
persists all outgoing logs to a local CSV file; rihno stop halts log transmission; rihno status
prints a runtime summary including the total number of logs transmitted; and rihno config
status reports whether the agent is currently authenticated. Additional commands will be in-
troduced in future releases. Upon successful registration, the agent name and a unique API key
are generated and persisted for future authentication. Registered agents act as Producers, con-
tinuously collecting host-based metrics (CPU usage, RAM utilization, disk activity, and system
temperature) and network-based metrics (traffic IP flow, port activity, and upload/download
speeds), then transmitting structured telemetry via TCP to the central ingestion layer.
Central Ingestion Layer (AWS EC2): All telemetry received from the producers is first
handled by a Go Dealer running on AWS EC2. The Go Dealer performs Authentication and
Verification of the incoming agent credentials (email, agent name, API key) against records
stored in AWS DynamoDB before forwarding the data. Verified telemetry is then dispatched in
parallel to two ingestion targets: an Apache Kafka cluster for real-time AI-pipeline streaming,
and a PostgreSQL database for persistent storage and dashboard consumption. This dual-
path architecture ensures that real-time threat analysis and persistent data storage operate
independently. </p>

<p>AI Detection Pipeline: The Kafka stream is consumed by Python-based consumers (via
TCP port 9092) that perform real-time feature engineering, normalization, and scaling using
Pandas and Scikit-learn. The processed data is fed into the AI Decision Engine, which
employs both Supervised and Unsupervised machine learning models built with Scikit-learn
and PyTorch, operating on a Python 3 runtime. A Rule-Based Decision Engine complements
the ML models to enhance detection accuracy. When the AI Decision Engine determines that an
intrusion is present (“If Intrusion” check), the Intrusion Alert Engine is triggered, generating
notifications and persisting alert records. </p>

<p>Web Dashboard and Agent Management: The web-based dashboard is built with
React.js, Tailwind CSS, nivo Charts, Axios, and Three.js for interactive visualization. It com-
municates with the Node.js + Express.js + Axios backend via RESTful APIs (HTTP GET)
to query PostgreSQL for historical telemetry, alert timelines, agent health, and aggregate se-
curity reports. The backend also receives AI Predictions and Intrusion alerts to relay to
the dashboard in real time. User authentication is handled by AWS Cognito. The dashboard
provides a comprehensive set of features: agent Management allows administrators to create,
register, edit, and delete monitored agents directly from the UI. A Network Map view renders
an interactive topology of all registered agents and their interconnections. Metrics Analysis
pages expose dedicated plots and charts (line, bar, pie, heatmap, and gauge) for CPU, RAM,
temperature, network throughput, and other collected telemetry. A Real-Time Kafka Log
Viewer streams live telemetry messages consumed from Kafka directly into the dashboard so
that operators can inspect raw logs as they flow through the system. When an intrusion is de-
tected the Notification System can deliver alerts through multiple channels in-app banners,
email, and SMS and administrators can manage a list of Email Recipients to whom intrusion
reports are automatically forwarded. Finally, an AI Log Analysis feature sends historical or
suspicious log data to an LLM and surfaces a natural-language summary and risk assessment
directly inside the dashboard.</p>

#### [Read Software Requirements Specification (SRS) Here](https://github.com/Team-X-Organization/RIHNO/blob/main/Doc/Rihno_SRS.pdf)

## Architecture Design

<img src="https://github.com/Team-X-Organization/RIHNO/blob/main/Doc/Rihno-Architecture.svg" />

