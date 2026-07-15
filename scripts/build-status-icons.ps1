param(
  [string]$Source = (Join-Path $PSScriptRoot '..\Icones\Status.png'),
  [string]$WildcardSource = (Join-Path $PSScriptRoot '..\Icones\Status_Coringa.png'),
  [string]$Destination = (Join-Path $PSScriptRoot '..\assets\status-icons')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = [System.IO.Path]::GetFullPath($Source)
$wildcardSourcePath = [System.IO.Path]::GetFullPath($WildcardSource)
$destinationPath = [System.IO.Path]::GetFullPath($Destination)

if (-not [System.IO.File]::Exists($sourcePath)) {
  throw "Folha de status não encontrada: $sourcePath"
}
if (-not [System.IO.File]::Exists($wildcardSourcePath)) {
  throw "Ícone de status Coringa não encontrado: $wildcardSourcePath"
}

$generatorSource = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class BossBarStatusIconGenerator
{
    private sealed class IconSpec
    {
        public string FileName;
        public int X;
        public int Y;
        public int Width;
        public int Height;

        public IconSpec(string fileName, int x, int y, int width, int height)
        {
            FileName = fileName;
            X = x;
            Y = y;
            Width = width;
            Height = height;
        }
    }

    private static bool IsConnectedBackground(Color color)
    {
        int maximum = Math.Max(color.R, Math.Max(color.G, color.B));
        int minimum = Math.Min(color.R, Math.Min(color.G, color.B));
        return minimum >= 205 && maximum - minimum <= 18;
    }

    private static void RemoveBoundaryDebris(Bitmap crop, bool[] background)
    {
        var visited = new bool[background.Length];
        int[] horizontal = { -1, 1, 0, 0 };
        int[] vertical = { 0, 0, -1, 1 };

        for (int startY = 0; startY < crop.Height; startY++)
        {
            for (int startX = 0; startX < crop.Width; startX++)
            {
                int startOffset = startY * crop.Width + startX;
                if (background[startOffset] || visited[startOffset]) continue;

                var component = new List<int>();
                var componentQueue = new Queue<int>();
                bool touchesBoundary = false;
                visited[startOffset] = true;
                componentQueue.Enqueue(startOffset);

                while (componentQueue.Count > 0)
                {
                    int offset = componentQueue.Dequeue();
                    component.Add(offset);
                    int x = offset % crop.Width;
                    int y = offset / crop.Width;
                    if (x <= 5 || y <= 5 || x >= crop.Width - 6 || y >= crop.Height - 6)
                    {
                        touchesBoundary = true;
                    }

                    for (int direction = 0; direction < 4; direction++)
                    {
                        int nextX = x + horizontal[direction];
                        int nextY = y + vertical[direction];
                        if (nextX < 0 || nextY < 0 || nextX >= crop.Width || nextY >= crop.Height)
                        {
                            continue;
                        }

                        int nextOffset = nextY * crop.Width + nextX;
                        if (background[nextOffset] || visited[nextOffset]) continue;
                        visited[nextOffset] = true;
                        componentQueue.Enqueue(nextOffset);
                    }
                }

                // A folha possui pequenos fragmentos dos quadros vizinhos junto
                // às divisões. Preserva o desenho principal e partículas úteis,
                // removendo apenas ilhas minúsculas ou recortes presos à borda.
                if (component.Count <= 8 || (touchesBoundary && component.Count <= 64))
                {
                    foreach (int offset in component) background[offset] = true;
                }
            }
        }
    }

    private static IconSpec[] BuildSpecs()
    {
        string[] names = {
            "status-01-abalado.png", "status-02-agarrado.png", "status-03-alquebrado.png",
            "status-04-apavorado.png", "status-05-atordoado.png", "status-06-caido.png",
            "status-07-cego.png", "status-08-confuso.png", "status-09-debilitado.png",
            "status-10-desprevenido.png", "status-11-doente.png", "status-12-em-chamas.png",
            "status-13-enfeiticado.png", "status-14-enjoado.png", "status-15-enredado.png",
            "status-16-envenenado.png", "status-17-esmorecido.png", "status-18-exausto.png",
            "status-19-fascinado.png", "status-20-fatigado.png", "status-21-fraco.png",
            "status-22-frustrado.png", "status-23-imovel.png", "status-24-inconsciente.png",
            "status-25-indefeso.png", "status-26-lento.png", "status-27-ofuscado.png",
            "status-28-paralisado.png", "status-29-pasmo.png", "status-30-petrificado.png",
            "status-31-sangrando.png", "status-32-sobrecarregado.png", "status-33-surdo.png",
            "status-34-surpreendido.png", "status-35-vulneravel.png"
        };
        int[] rowY = { 0, 223, 410, 599, 782 };
        int[] rowHeight = { 201, 169, 167, 164, 194 };
        var specs = new IconSpec[names.Length];
        for (int index = 0; index < names.Length; index++)
        {
            int row = index / 7;
            int column = index % 7;
            specs[index] = new IconSpec(names[index], column * 212, rowY[row], 212, rowHeight[row]);
        }
        return specs;
    }

    private static Bitmap ExtractTransparentIcon(Bitmap source, IconSpec spec)
    {
        var crop = new Bitmap(spec.Width, spec.Height, PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(crop))
        {
            graphics.DrawImage(
                source,
                new Rectangle(0, 0, spec.Width, spec.Height),
                new Rectangle(spec.X, spec.Y, spec.Width, spec.Height),
                GraphicsUnit.Pixel
            );
        }

        int pixelCount = crop.Width * crop.Height;
        var background = new bool[pixelCount];
        var queued = new bool[pixelCount];
        var queue = new Queue<int>();

        Action<int, int> enqueue = (x, y) => {
            if (x < 0 || y < 0 || x >= crop.Width || y >= crop.Height) return;
            int offset = y * crop.Width + x;
            if (queued[offset] || !IsConnectedBackground(crop.GetPixel(x, y))) return;
            queued[offset] = true;
            queue.Enqueue(offset);
        };

        for (int x = 0; x < crop.Width; x++)
        {
            enqueue(x, 0);
            enqueue(x, crop.Height - 1);
        }
        for (int y = 0; y < crop.Height; y++)
        {
            enqueue(0, y);
            enqueue(crop.Width - 1, y);
        }

        while (queue.Count > 0)
        {
            int offset = queue.Dequeue();
            background[offset] = true;
            int x = offset % crop.Width;
            int y = offset / crop.Width;
            enqueue(x - 1, y);
            enqueue(x + 1, y);
            enqueue(x, y - 1);
            enqueue(x, y + 1);
        }

        RemoveBoundaryDebris(crop, background);

        int left = crop.Width;
        int top = crop.Height;
        int right = -1;
        int bottom = -1;
        for (int y = 0; y < crop.Height; y++)
        {
            for (int x = 0; x < crop.Width; x++)
            {
                int offset = y * crop.Width + x;
                if (background[offset])
                {
                    crop.SetPixel(x, y, Color.Transparent);
                    continue;
                }

                left = Math.Min(left, x);
                top = Math.Min(top, y);
                right = Math.Max(right, x);
                bottom = Math.Max(bottom, y);
            }
        }

        if (right < left || bottom < top)
        {
            crop.Dispose();
            throw new InvalidDataException("O recorte " + spec.FileName + " ficou vazio.");
        }

        var canvas = new Bitmap(160, 160, PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(canvas))
        {
            graphics.Clear(Color.Transparent);
            graphics.CompositingMode = CompositingMode.SourceOver;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.SmoothingMode = SmoothingMode.HighQuality;

            int contentWidth = right - left + 1;
            int contentHeight = bottom - top + 1;
            double scale = Math.Min(144.0 / contentWidth, 144.0 / contentHeight);
            int targetWidth = Math.Max(1, (int)Math.Round(contentWidth * scale));
            int targetHeight = Math.Max(1, (int)Math.Round(contentHeight * scale));
            int targetX = (canvas.Width - targetWidth) / 2;
            int targetY = (canvas.Height - targetHeight) / 2;
            graphics.DrawImage(
                crop,
                new Rectangle(targetX, targetY, targetWidth, targetHeight),
                new Rectangle(left, top, contentWidth, contentHeight),
                GraphicsUnit.Pixel
            );
        }
        crop.Dispose();
        return canvas;
    }

    public static void Generate(string sourcePath, string destinationPath)
    {
        Directory.CreateDirectory(destinationPath);
        using (var source = new Bitmap(sourcePath))
        {
            if (source.Width != 1484 || source.Height != 1060)
            {
                throw new InvalidDataException(
                    "A folha Status.png deve medir 1484x1060 pixels, mas mede " +
                    source.Width + "x" + source.Height + "."
                );
            }

            foreach (IconSpec spec in BuildSpecs())
            {
                using (Bitmap icon = ExtractTransparentIcon(source, spec))
                {
                    icon.Save(Path.Combine(destinationPath, spec.FileName), ImageFormat.Png);
                }
            }
        }
    }

    public static void GenerateStandalone(string sourcePath, string destinationPath, string fileName)
    {
        using (var source = new Bitmap(sourcePath))
        {
            var spec = new IconSpec(fileName, 0, 0, source.Width, source.Height);
            using (Bitmap icon = ExtractTransparentIcon(source, spec))
            {
                icon.Save(Path.Combine(destinationPath, fileName), ImageFormat.Png);
            }
        }
    }
}
'@

Add-Type -TypeDefinition $generatorSource -ReferencedAssemblies System.Drawing
[BossBarStatusIconGenerator]::Generate($sourcePath, $destinationPath)
[BossBarStatusIconGenerator]::GenerateStandalone(
  $wildcardSourcePath,
  $destinationPath,
  'status-36-coringa.png'
)

$generated = Get-ChildItem -LiteralPath $destinationPath -Filter 'status-*.png' -File
if ($generated.Count -ne 36) {
  throw "A geração produziu $($generated.Count) ícones; eram esperados 36."
}

Write-Output "36 ícones de status gerados em $destinationPath"
