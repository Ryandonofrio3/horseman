use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::Path;
use crate::config;

/// Active PTY session for running slash commands
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl PtySession {
    /// Spawn an interactive Claude session in a PTY
    pub fn spawn(
        _command_id: String,
        claude_session_id: &str,
        working_directory: &str,
    ) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let claude_bin = config::resolve_claude_binary();
        let mut cmd = CommandBuilder::new(&claude_bin);
        cmd.arg("--resume");
        cmd.arg(claude_session_id);
        cmd.cwd(Path::new(working_directory));

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn claude: {}", e))?;

        Ok(Self {
            master: pair.master,
            child,
        })
    }

    /// Write a command to the PTY stdin
    pub fn write_command(&self, command: &str) -> Result<(), String> {
        let mut writer = self
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        // Write the command followed by newline
        writeln!(writer, "{}", command).map_err(|e| format!("Failed to write command: {}", e))?;

        // Flush to ensure it's sent
        writer
            .flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }

    /// Get a reader for PTY output
    pub fn take_reader(&self) -> Result<Box<dyn Read + Send>, String> {
        self.master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))
    }

    /// Get the process ID
    pub fn process_id(&self) -> Option<u32> {
        self.child.process_id()
    }

    /// Check if child is still running
    pub fn try_wait(&mut self) -> Result<Option<portable_pty::ExitStatus>, String> {
        self.child
            .try_wait()
            .map_err(|e| format!("Failed to check child status: {}", e))
    }

    /// Kill the child process
    pub fn kill(&mut self) -> Result<(), String> {
        self.child
            .kill()
            .map_err(|e| format!("Failed to kill child: {}", e))
    }
}
