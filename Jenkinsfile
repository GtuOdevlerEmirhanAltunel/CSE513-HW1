pipeline {
    agent any

    // Fill in these three deployment values before the first real deployment.
    environment {
        DEPLOY_HOST = 'CHANGE_ME.example.com'
        DEPLOY_PORT = '22'
        DEPLOY_PATH = '/CHANGE_ME/homeworks/cse513-1'
    }

    options {
        disableConcurrentBuilds(abortPrevious: true)
        skipDefaultCheckout(true)
        timeout(time: 10, unit: 'MINUTES')
        timestamps()
    }

    // The GitHub plugin handles POST requests sent to /github-webhook/.
    triggers {
        githubPush()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Check agent') {
            steps {
                sh '''
                    set -eu
                    command -v node
                    command -v npm
                    command -v ssh
                    command -v rsync
                    node --version
                    npm --version
                '''
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([
                    sshUserPrivateKey(
                        credentialsId: 'cse513-deploy-ssh',
                        keyFileVariable: 'SSH_PRIVATE_KEY',
                        usernameVariable: 'SSH_USER'
                    ),
                    string(
                        credentialsId: 'cse513-known-hosts',
                        variable: 'SSH_KNOWN_HOSTS'
                    )
                ]) {
                    sh(label: 'Deploy dist over SSH', script: '''#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DEPLOY_HOST}" || "${DEPLOY_HOST}" == *CHANGE_ME* || ! "${DEPLOY_HOST}" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "DEPLOY_HOST must be a DNS name or IPv4 address. Edit it in Jenkinsfile." >&2
    exit 1
fi

if [[ ! "${DEPLOY_PORT}" =~ ^[0-9]+$ ]] || (( DEPLOY_PORT < 1 || DEPLOY_PORT > 65535 )); then
    echo "DEPLOY_PORT must be between 1 and 65535." >&2
    exit 1
fi

if [[ -z "${DEPLOY_PATH}" || "${DEPLOY_PATH}" == *CHANGE_ME* || ! "${DEPLOY_PATH}" =~ ^/[A-Za-z0-9._/-]+$ || "${DEPLOY_PATH}" == *..* ]]; then
    echo "DEPLOY_PATH must be a safe absolute path without '..'. Edit it in Jenkinsfile." >&2
    exit 1
fi

case "${DEPLOY_PATH%/}" in
    ''|/|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var|/var/www)
        echo "Refusing to deploy to broad system path: ${DEPLOY_PATH}" >&2
        exit 1
        ;;
esac

known_hosts_file="$(mktemp)"
trap 'rm -f "${known_hosts_file}"' EXIT
printf '%s\n' "${SSH_KNOWN_HOSTS}" > "${known_hosts_file}"
chmod 600 "${known_hosts_file}"

ssh_options=(
    -i "${SSH_PRIVATE_KEY}"
    -p "${DEPLOY_PORT}"
    -o BatchMode=yes
    -o IdentitiesOnly=yes
    -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=${known_hosts_file}"
)

# The path is validated above before it is included in the remote command.
ssh "${ssh_options[@]}" "${SSH_USER}@${DEPLOY_HOST}" "mkdir -p -- ${DEPLOY_PATH}"

# --delete-delay makes the remote directory an exact mirror of dist/. The
# destination guard above prevents accidentally targeting a broad directory.
rsync \
    -az \
    --delete-delay \
    --chmod=D755,F644 \
    -e "ssh -i ${SSH_PRIVATE_KEY} -p ${DEPLOY_PORT} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts_file}" \
    dist/ \
    "${SSH_USER}@${DEPLOY_HOST}:${DEPLOY_PATH%/}/"
''')
                }
            }
        }
    }

    post {
        success {
            echo 'Build, tests, and deployment completed successfully.'
        }
        failure {
            echo 'Deployment stopped. Read the failed stage in the console log.'
        }
    }
}
