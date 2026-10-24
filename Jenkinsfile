pipeline {
    agent any

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
                    command -v scp
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
                sh 'scp -r ./dist/* root@202.92.21.30:/root/Projects/FileServe/public/homeworks/cse513-1'
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
