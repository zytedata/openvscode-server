function Create-TmpJson($Obj) {
	$FileName = [System.IO.Path]::GetTempFileName()
	ConvertTo-Json -Depth 100 $Obj | Out-File -Encoding UTF8 $FileName
	return $FileName
}

$File = $args[0]

$Auth = Create-TmpJson @{
	Version = "1.0.0"
	AuthenticationType = "AAD_CERT"
	ClientId = $env:ESRPClientId
	AuthCert = @{
		SubjectName = $env:ESRPAuthCertificateSubjectName
		StoreLocation = "LocalMachine"
		StoreName = "My"
	}
	RequestSigningCert = @{
		SubjectName = $env:ESRPCertificateSubjectName
		StoreLocation = "LocalMachine"
		StoreName = "My"
	}
}

$Policy = Create-TmpJson @{
	Version = "1.0.0"
}

$Input = Create-TmpJson @{
	Version = "1.0.0"
	SignBatches = @(
		@{
			SourceLocationType = "UNC"
			SignRequestFiles = @(
				@{
					SourceLocation = $File
				}
			)
			SigningInfo = @{
				Operations = @(
					@{
						KeyCode = "CP-230012"
						OperationCode = "SigntoolSign"
						Parameters = @{
							OpusName = "VS Code"
							OpusInfo = "https://code.visualstudio.com/"
							Append = "/as"
							FileDigest = "/fd `"SHA256`""
							PageHash = "/NPH"
							TimeStamp = "/tr `"http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer`" /td sha256"
						}
						ToolName = "sign"
						ToolVersion = "1.0"
					},
					@{
						KeyCode = "CP-230012"
						OperationCode = "SigntoolVerify"
						Parameters = @{
							VerifyAll = "/all"
						}
						ToolName = "sign"
						ToolVersion = "1.0"
					}
				)
			}
		}
	)
}

# https://github.com/microsoft/vscode/issues/73805
$Repo = "$env:BUILD_SOURCESDIRECTORY"
$ProductName = (Get-Content "$Repo\product.json" | ConvertFrom-Json).nameLong
& "$Repo\node_modules\rcedit\bin\rcedit.exe" $File --set-version-string "ProductName" "$ProductName"

$Output = [System.IO.Path]::GetTempFileName()
$ScriptPath = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
& "$ScriptPath\ESRPClient\packages\Microsoft.ESRPClient.1.2.25\tools\ESRPClient.exe" Sign -a $Auth -p $Policy -i $Input -o $Output
