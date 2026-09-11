# BENCH_HOME et BENCH_LEDGER sont HORS du depot. Un worktree de ledger place a
# ./.ledger briquerait son propre harness sur l'evenement meme qu'il doit
# survivre : il polluerait `git status`, donc input_digest, donc toute
# attestation, des le premier clone d'un conteneur neuf.
#
# remoteUser vscode n'est pas cosmetique : initdb REFUSE de tourner en root.
FROM mcr.microsoft.com/devcontainers/base:noble

COPY infra/bootstrap /tmp/bootstrap
RUN bash /tmp/bootstrap/00-apt-base.sh \
 && bash /tmp/bootstrap/20-postgres18.sh \
 && bash /tmp/bootstrap/50-runc-oci.sh \
 && rm -rf /tmp/bootstrap

ENV BENCH_HOME=/bench BENCH_LEDGER=/bench-ledger
RUN mkdir -p /bench /bench-ledger && chown vscode:vscode /bench /bench-ledger
USER vscode
