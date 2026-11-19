/** PROTOTYPE, throwaway: Apple on-device model brief helper. Build: swiftc -O -target arm64-apple-macos26.4 brief.swift -o brief */
import Foundation
import FoundationModels
func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
let a = CommandLine.arguments
let model = SystemLanguageModel(useCase: .general, guardrails: .default)
guard case .available = model.availability else { log("unavailable: \(model.availability)"); exit(3) }
let schema = try JSONDecoder().decode(GenerationSchema.self, from: Data(contentsOf: URL(fileURLWithPath: a[1])))
let guide = try String(contentsOfFile: a[2], encoding: .utf8)
let input = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8)!
let ins = Instructions(guide)
let ti = try await model.tokenCount(for: ins)
let tp = try await model.tokenCount(for: Prompt(input))
let ts = try await model.tokenCount(for: schema)
log("tokens instructions=\(ti) prompt=\(tp) schema=\(ts) sum=\(ti+tp+ts) context=\(model.contextSize)")
let session = LanguageModelSession(model: model, instructions: ins)
let t1 = Date()
do {
  let r = try await session.respond(to: input, schema: schema)
  let gen = Int(Date().timeIntervalSince(t1)*1000)
  let out = r.content.jsonString
  let to = try await model.tokenCount(for: Prompt(out))
  log("ok genms=\(gen) output=\(to)")
  print(out)
} catch let e as LanguageModelSession.GenerationError {
  log("GenerationError genms=\(Int(Date().timeIntervalSince(t1)*1000)): \(e)")
  exit(2)
}
